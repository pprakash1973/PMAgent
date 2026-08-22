export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireProjectAccess } from "@/lib/project-access";

// Reconstruct a schedule task status from its recorded progress
function statusFromProgress(pct: number): string {
  if (pct >= 100) return "complete";
  if (pct > 0) return "in_progress";
  return "not_started";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; blId: string }> }
) {
  const { id, blId } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;

  const url = new URL(req.url);
  const confirm = url.searchParams.get("confirm") === "true";

  // Target baseline to roll back TO
  const target = await (prisma as any).scopeBaseline.findFirst({
    where: { id: blId, projectId: id },
  });
  if (!target) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // All baselines newer than the target — these will be hard-deleted
  const newerBaselines = await (prisma as any).scopeBaseline.findMany({
    where: { projectId: id, version: { gt: target.version } },
    orderBy: { version: "asc" },
  });

  if (newerBaselines.length === 0) {
    return NextResponse.json(
      { error: "This is already the latest baseline — nothing to roll back." },
      { status: 422 }
    );
  }

  const deletedIds: string[] = newerBaselines.map((b: any) => b.id);
  const deletedVersions: number[] = newerBaselines.map((b: any) => b.version);

  // Requirement keys the target baseline holds as the source of truth
  const targetSnapshot = (target.snapshot as any[]) ?? [];
  const targetKeys = new Set(targetSnapshot.map((r: any) => r.requirementKey));

  // Keys introduced AFTER the target (present in any newer snapshot, absent from target)
  const addedAfterTarget = new Set<string>();
  for (const bl of newerBaselines) {
    const snap = (bl.snapshot as any[]) ?? [];
    for (const r of snap) {
      if (!targetKeys.has(r.requirementKey)) addedAfterTarget.add(r.requirementKey);
    }
  }

  // ── Compute schedule impact for the confirmation preview ────────────────────
  const allTasks = await prisma.scheduleTask.findMany({ where: { projectId: id } });

  // CR-added tasks whose linked req key was introduced after the target → will be deleted
  const crTasksToDelete = allTasks.filter((t) => {
    if (!t.wbsCode.startsWith("CR-")) return false;
    const linkedKey = t.wbsCode.slice(3);
    return addedAfterTarget.has(linkedKey);
  });
  const crTasksWithProgress = crTasksToDelete.filter((t) => (t.percentComplete ?? 0) > 0);

  // Descoped tasks → will be restored (their scope comes back on rollback)
  const descopedToRestore = allTasks.filter((t) => t.status === "descoped");

  // Milestones added by the deleted baselines (matched via their note stamp)
  const allMilestones = await prisma.milestone.findMany({ where: { projectId: id } });
  const milestonesToDelete = allMilestones.filter((m) =>
    deletedVersions.some((v) => (m.notes ?? "").includes(`BL v${v}`))
  );

  // Artifacts stamped to a deleted baseline → will need regeneration
  const staleArtifactRows = await prisma.artifact.findMany({
    where: { projectId: id, scopeBaselineId: { in: deletedIds } },
    select: { id: true, artifactType: true },
  });
  const staleArtifacts = staleArtifactRows.map((a) => ({
    id: a.id,
    name: a.artifactType.replace(/_/g, " "),
  }));

  // ── Warn-but-allow guardrail ────────────────────────────────────────────────
  if (!confirm) {
    return NextResponse.json({
      requiresConfirmation: true,
      target: { id: target.id, label: target.label, version: target.version },
      willDelete: {
        baselines: newerBaselines.map((b: any) => ({ label: b.label, version: b.version })),
        scheduleTasks: crTasksToDelete.map((t) => ({
          wbsCode: t.wbsCode, name: t.name, percentComplete: t.percentComplete,
        })),
        scheduleTasksWithProgress: crTasksWithProgress.length,
        milestones: milestonesToDelete.map((m) => m.name),
      },
      willRestore: {
        requirementsReactivated: targetSnapshot.length,
        descopedTasks: descopedToRestore.map((t) => ({ wbsCode: t.wbsCode, name: t.name })),
      },
      willFlagStale: staleArtifacts.map((a) => a.name),
      message:
        `Rolling back to ${target.label} will permanently delete ${newerBaselines.length} newer baseline(s)` +
        (crTasksWithProgress.length > 0
          ? ` and DISCARD progress on ${crTasksWithProgress.length} schedule task(s).`
          : `.`) +
        ` Artifacts generated against the deleted baseline(s) will be flagged for regeneration. This cannot be undone.`,
    }, { status: 409 });
  }

  // ── Execute rollback ────────────────────────────────────────────────────────
  const results: string[] = [];

  // 1. Requirements — realign live table to the target snapshot
  //    Reactivate everything in the target snapshot
  const reactivated = await prisma.requirement.updateMany({
    where: { projectId: id, requirementKey: { in: [...targetKeys] } },
    data: { isActive: true },
  });
  //    Deactivate reqs the deleted CRs introduced (not in target)
  const deactivateKeys = [...addedAfterTarget].filter((k) => !targetKeys.has(k));
  let deactivated = { count: 0 };
  if (deactivateKeys.length > 0) {
    deactivated = await prisma.requirement.updateMany({
      where: { projectId: id, requirementKey: { in: deactivateKeys } },
      data: { isActive: false },
    });
  }
  results.push(`Requirements realigned: ${reactivated.count} restored, ${deactivated.count} removed`);

  // 2. Schedule — delete CR-added tasks introduced after target; restore descoped tasks
  if (crTasksToDelete.length > 0) {
    await prisma.scheduleTask.deleteMany({
      where: { id: { in: crTasksToDelete.map((t) => t.id) } },
    });
    results.push(`Deleted ${crTasksToDelete.length} CR-added schedule task(s)`);
  }
  for (const t of descopedToRestore) {
    await prisma.scheduleTask.update({
      where: { id: t.id },
      data: { status: statusFromProgress(t.percentComplete ?? 0) },
    });
  }
  if (descopedToRestore.length > 0) {
    results.push(`Restored ${descopedToRestore.length} descoped task(s)`);
  }

  // 3. Milestones added by deleted baselines
  if (milestonesToDelete.length > 0) {
    await prisma.milestone.deleteMany({
      where: { id: { in: milestonesToDelete.map((m) => m.id) } },
    });
    results.push(`Deleted ${milestonesToDelete.length} milestone(s) added by the rolled-back baseline(s)`);
  }

  // 4. Artifacts — null the stamp so they surface as stale against the restored baseline
  if (staleArtifacts.length > 0) {
    await prisma.artifact.updateMany({
      where: { projectId: id, scopeBaselineId: { in: deletedIds } },
      data: { scopeBaselineId: null },
    });
    results.push(`${staleArtifacts.length} artifact(s) flagged for regeneration against ${target.label}`);
  }

  // 5. Hard-delete the newer baselines and ensure target is the active (reviewed) one
  await (prisma as any).scopeBaseline.deleteMany({
    where: { id: { in: deletedIds } },
  });
  await (prisma as any).scopeBaseline.update({
    where: { id: target.id },
    data: { deltaReviewed: true },
  });
  results.push(`Rolled back to ${target.label} — ${newerBaselines.length} newer baseline(s) deleted`);

  return NextResponse.json({ ok: true, target: { label: target.label, version: target.version }, results });
}
