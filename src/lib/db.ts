import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

function createPrisma() {
  const url = process.env.DATABASE_URL!;
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma ?? createPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
