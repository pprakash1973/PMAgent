import { PrismaClient } from "@prisma/client";

function createPrisma(): PrismaClient {
  const url = process.env.DATABASE_URL!;

  if (url?.startsWith("file:")) {
    // Local SQLite — optional dependency, only available in dev
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
    const adapter = new PrismaBetterSqlite3({ url });
    return new PrismaClient({ adapter } as any);
  }

  if (!url) throw new Error("DATABASE_URL is not set");

  // Neon over WebSocket (443) rather than raw Postgres (5432).
  //
  // Opt-in via DATABASE_DRIVER=neon. Many corporate networks permit 443 but
  // block outbound 5432, which surfaces as an ECONNRESET ~20s into the TCP
  // handshake rather than a clean refusal — hard to diagnose and impossible to
  // work around with the pg driver. The Neon driver carries the same wire
  // protocol over WSS, including real session transactions.
  //
  // Not automatic on hostname: hosts that can reach 5432 should keep using pg,
  // which avoids the WebSocket hop. TLS here is terminated by the driver
  // against Neon's public certificate, so DATABASE_CA_CERT does not apply.
  if (process.env.DATABASE_DRIVER === "neon") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { neonConfig } = require("@neondatabase/serverless");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaNeon } = require("@prisma/adapter-neon");
    // Node 22+ has a global WebSocket; the driver needs it wired up explicitly.
    if (!neonConfig.webSocketConstructor) neonConfig.webSocketConstructor = globalThis.WebSocket;
    // PrismaNeon takes a PoolConfig and owns the pool itself — passing a Pool
    // instance silently yields a client with no connection string at all.
    const adapter = new PrismaNeon({ connectionString: url });
    return new PrismaClient({ adapter } as any);
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pool } = require("pg");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaPg } = require("@prisma/adapter-pg");

  // SEC: verify the server certificate. Disabling this (rejectUnauthorized:false)
  // makes the DB connection trivially MITM-able — unacceptable in a hybrid tenancy
  // where traffic crosses VNet / ExpressRoute / internet boundaries.
  // Set DATABASE_CA_CERT (PEM) when the server uses a private/enterprise CA.
  const caCert = process.env.DATABASE_CA_CERT;
  const ssl = caCert
    ? { rejectUnauthorized: true, ca: caCert }
    : { rejectUnauthorized: true };

  const pool = new Pool({
    connectionString: url,
    ssl,
    // Bound the pool per process — App Service runs several workers per instance
    // and Postgres connection ceilings are per-server, not per-process.
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter } as any);
}

function getClient(): PrismaClient {
  const g = globalThis as any;
  if (!g._prisma) g._prisma = createPrisma();
  return g._prisma;
}

// Lazy proxy — PrismaClient is only instantiated on first actual DB call,
// not at module load time (prevents build-time crashes).
export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop) {
    return (getClient() as any)[prop];
  },
});
