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
