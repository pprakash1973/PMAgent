/**
 * Hard-delete users by full name (case-insensitive, partial match).
 * Removes all assignments, invitations, and the user record.
 * Projects owned by the user will have pmOwnerId cleared (not deleted).
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx ts-node --project tsconfig.seed.json prisma/delete-users.ts "Kurian" "Adam"
 *
 * For Neon (production):
 *   1. Get DATABASE_URL from Vercel dashboard → Settings → Environment Variables
 *   2. Run:  DATABASE_URL="postgresql://..." npx ts-node --project tsconfig.seed.json prisma/delete-users.ts "Kurian" "Adam"
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const names = process.argv.slice(2);
if (names.length === 0) {
  console.error("Usage: ts-node prisma/delete-users.ts <name1> [name2] ...");
  process.exit(1);
}

const url = process.env.DATABASE_URL ?? "file:./dev.db";
console.log("Connecting to:", url.startsWith("postgresql") ? url.split("@")[1] : url);

function createClient() {
  if (url.startsWith("file:")) {
    const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
    const adapter = new PrismaBetterSqlite3({ url });
    return new PrismaClient({ adapter } as any);
  }
  const { Pool } = require("pg");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter } as any);
}

const prisma = createClient();

async function deleteUsers() {
  // Find matching users (OR across all supplied names)
  const users = await prisma.user.findMany({
    where: {
      OR: names.map((n) => ({ fullName: { contains: n, mode: "insensitive" as const } })),
    },
  });

  if (users.length === 0) {
    console.log(`No users found matching: ${names.join(", ")}`);
    return;
  }

  console.log(`\nFound ${users.length} user(s):`);
  users.forEach((u) => console.log(`  • ${u.fullName} <${u.email}> [${u.role}] ${u.status}`));
  console.log();

  for (const user of users) {
    console.log(`Deleting ${user.fullName}…`);

    // 1. Delete program assignments
    const pa = await prisma.programAssignment.deleteMany({ where: { userId: user.id } });
    if (pa.count) console.log(`  Removed ${pa.count} program assignment(s)`);

    // 2. Delete cluster assignments
    const ca = await (prisma as any).clusterAssignment.deleteMany({ where: { userId: user.id } });
    if (ca.count) console.log(`  Removed ${ca.count} cluster assignment(s)`);

    // 3. Delete account/DM assignments
    const aa = await (prisma as any).accountAssignment.deleteMany({ where: { userId: user.id } });
    if (aa.count) console.log(`  Removed ${aa.count} account assignment(s)`);

    // 4. Delete invitations
    const inv = await prisma.invitation.deleteMany({ where: { userId: user.id } });
    if (inv.count) console.log(`  Removed ${inv.count} invitation(s)`);

    // 5. Clear pmOwnerId on any projects they own (don't delete the projects)
    const proj = await prisma.project.updateMany({
      where: { pmOwnerId: user.id },
      data: { pmOwnerId: null as any },
    });
    if (proj.count) console.log(`  Cleared pmOwnerId on ${proj.count} project(s) — projects preserved`);

    // 6. Clear primaryDhId on clusters if this DH was set as primary
    await (prisma as any).cluster.updateMany({
      where: { primaryDhId: user.id },
      data: { primaryDhId: null },
    });

    // 7. Clear primaryDmId on accounts if this DM was set as primary
    await (prisma as any).orgAccount.updateMany({
      where: { primaryDmId: user.id },
      data: { primaryDmId: null },
    });

    // 8. Delete the user
    await prisma.user.delete({ where: { id: user.id } });
    console.log(`  ✅ ${user.fullName} deleted\n`);
  }

  console.log("Done.");
}

deleteUsers()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
