import { PrismaClient } from "@prisma/client";

function createPrisma() {
  const url = process.env.DATABASE_URL!;

  // Local SQLite dev — needs the better-sqlite3 driver adapter
  if (url?.startsWith("file:")) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
    const adapter = new PrismaBetterSqlite3({ url });
    return new PrismaClient({ adapter } as any);
  }

  // Production PostgreSQL — standard client
  return new PrismaClient();
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma ?? createPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
