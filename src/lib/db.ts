import { PrismaClient } from "@prisma/client";

function createPrisma(): PrismaClient {
  const url = process.env.DATABASE_URL!;

  if (url?.startsWith("file:")) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
    const adapter = new PrismaBetterSqlite3({ url });
    return new PrismaClient({ adapter } as any);
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pool } = require("pg");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaPg } = require("@prisma/adapter-pg");
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
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
