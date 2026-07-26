export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { randomUUID } from "crypto";

export async function POST() {
  const { error } = await requireAdmin();
  if (error) return error;

  const log: string[] = [];

  const dhUsers = await prisma.user.findMany({ where: { role: "dh" } });
  log.push(`Found ${dhUsers.length} DH user(s): ${dhUsers.map((u) => u.fullName).join(", ")}`);

  for (const user of dhUsers) {
    const accountAssignments = await (prisma as any).accountAssignment.findMany({
      where: { userId: user.id },
      include: { account: { select: { id: true, name: true, clusterId: true } } },
    });

    if (accountAssignments.length === 0) {
      log.push(`${user.fullName}: no stale account_assignments`);
      continue;
    }

    const clusterIds: string[] = [...new Set<string>(
      accountAssignments.map((a: any) => a.account?.clusterId).filter(Boolean)
    )];

    log.push(`${user.fullName}: migrating ${accountAssignments.length} account_assignments → ${clusterIds.length} cluster(s)`);

    for (const clusterId of clusterIds) {
      try {
        await (prisma as any).clusterAssignment.upsert({
          where: { clusterId_userId: { clusterId, userId: user.id } },
          create: { id: randomUUID(), clusterId, userId: user.id, isPrimary: false, assignedBy: "maintenance-fix" },
          update: {},
        });
      } catch (err: any) {
        log.push(`  WARN: could not upsert cluster assignment (${clusterId}, ${user.id}): ${err.message}`);
      }
    }

    const deleted = await (prisma as any).accountAssignment.deleteMany({ where: { userId: user.id } });
    log.push(`${user.fullName}: removed ${deleted.count} stale account_assignment(s)`);
  }

  // Auto-promote primary DH per cluster where none is set
  const clusters = await (prisma as any).cluster.findMany({
    where: { deletedAt: null },
    include: { clusterAssignments: { orderBy: { assignedAt: "asc" } } },
  });

  for (const cluster of clusters) {
    if (!cluster.clusterAssignments.length) continue;
    const hasPrimary = cluster.clusterAssignments.some((a: any) => a.isPrimary);
    if (!hasPrimary) {
      const first = cluster.clusterAssignments[0];
      await (prisma as any).clusterAssignment.update({
        where: { clusterId_userId: { clusterId: cluster.id, userId: first.userId } },
        data: { isPrimary: true },
      });
      await (prisma as any).cluster.update({
        where: { id: cluster.id },
        data: { primaryDhId: first.userId },
      });
      const u = await prisma.user.findUnique({ where: { id: first.userId } });
      log.push(`Auto-promoted ${u?.fullName ?? first.userId} as Primary DH for cluster "${cluster.name}"`);
    }
  }

  log.push("Done.");
  return NextResponse.json({ ok: true, log });
}
