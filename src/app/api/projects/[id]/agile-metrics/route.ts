export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id: projectId } = await params;
  const db = prisma as any;

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { budget: true, deliveryMethod: true, commercialModel: true },
  });

  const sprints = await db.sprint.findMany({
    where: { projectId },
    orderBy: { sprintNumber: "asc" },
    include: {
      backlogItems: {
        select: { id: true, state: true, points: true, baselinePoints: true, inContractedBaseline: true },
      },
    },
  });

  const closedSprints = sprints.filter((s: any) => s.state === "closed");

  // ── Velocity ─────────────────────────────────────────────────────────────────
  const velocities = closedSprints.map((s: any) => {
    const accepted = (s.backlogItems ?? [])
      .filter((i: any) => i.state === "accepted")
      .reduce((sum: number, i: any) => sum + (i.points ?? 0), 0);
    return { sprintNumber: s.sprintNumber, label: s.label, accepted };
  });

  const avgVelocity = velocities.length > 0
    ? velocities.reduce((sum: number, v: any) => sum + v.accepted, 0) / velocities.length
    : null;

  // ── Burndown (scope - accepted per sprint) ────────────────────────────────────
  const allItems = await db.backlogItem.findMany({
    where: { projectId },
    select: { id: true, state: true, points: true, baselinePoints: true, inContractedBaseline: true, sprintId: true },
  });

  const totalScope = allItems.reduce((sum: number, i: any) => sum + (i.points ?? 0), 0);
  let burndownRemaining = totalScope;
  const burndown: { sprintNumber: number; label: string; remaining: number; accepted: number }[] = [];

  for (const s of sprints) {
    const acceptedInSprint = (s.backlogItems ?? [])
      .filter((i: any) => i.state === "accepted")
      .reduce((sum: number, i: any) => sum + (i.points ?? 0), 0);
    burndownRemaining -= acceptedInSprint;

    const cumulativeAccepted = totalScope - burndownRemaining;
    burndown.push({
      sprintNumber: s.sprintNumber,
      label: s.label,
      remaining: Math.max(0, burndownRemaining),
      accepted: cumulativeAccepted,
    });
  }

  // ── Commitment reliability ────────────────────────────────────────────────────
  const commitmentData = closedSprints.map((s: any) => {
    const committed = s.committedPoints ?? 0;
    const accepted = (s.backlogItems ?? [])
      .filter((i: any) => i.state === "accepted")
      .reduce((sum: number, i: any) => sum + (i.points ?? 0), 0);
    return {
      sprintNumber: s.sprintNumber,
      label: s.label,
      committed,
      accepted,
      reliability: committed > 0 ? Math.min(100, Math.round((accepted / committed) * 100)) : null,
    };
  });

  const avgReliability = commitmentData.filter((c: any) => c.reliability != null).length > 0
    ? commitmentData.filter((c: any) => c.reliability != null).reduce((sum: number, c: any) => sum + c.reliability!, 0)
      / commitmentData.filter((c: any) => c.reliability != null).length
    : null;

  // ── AgileEVM (Fixed Price / Capped only) ─────────────────────────────────────
  let evm: Record<string, unknown> | null = null;
  const commercialModel = project?.commercialModel ?? "fixed_price";

  if (commercialModel !== "time_and_materials" && project?.budget) {
    const baselineItems = allItems.filter((i: any) => i.inContractedBaseline);
    const baselinePoints = baselineItems.reduce((sum: number, i: any) => sum + (i.baselinePoints ?? i.points ?? 0), 0);
    const bac = project.budget;
    const baselineCostPerPoint = baselinePoints > 0 ? bac / baselinePoints : null;

    const acceptedBaselinePoints = baselineItems
      .filter((i: any) => i.state === "accepted")
      .reduce((sum: number, i: any) => sum + (i.baselinePoints ?? i.points ?? 0), 0);

    const ev = baselineCostPerPoint != null ? acceptedBaselinePoints * baselineCostPerPoint : null;

    // Actual cost from cost ledger
    const ledger = await db.costLedger.findMany({
      where: { projectId },
      select: { amount: true },
    });
    const ac = ledger.reduce((sum: number, l: any) => sum + l.amount, 0);

    const cpi = ev != null && ac > 0 ? ev / ac : null;
    const sv = ev != null ? ev - (bac * (closedSprints.length / Math.max(1, sprints.length))) : null;

    evm = {
      bac,
      baselinePoints,
      baselineCostPerPoint,
      acceptedBaselinePoints,
      ev,
      ac,
      cpi,
      sv,
      eacForecast: cpi != null && cpi > 0 ? bac / cpi : null,
      marginAtCompletion: cpi != null ? ((bac - (cpi > 0 ? bac / cpi : bac)) / bac) * 100 : null,
    };
  }

  // ── Sprints summary ───────────────────────────────────────────────────────────
  const activeSprint = sprints.find((s: any) => s.state === "active") ?? null;
  const nextSprint = sprints.find((s: any) => s.state === "planned") ?? null;

  return NextResponse.json({
    totalScope,
    avgVelocity,
    avgReliability,
    velocities,
    burndown,
    commitmentData,
    evm,
    sprints: {
      total: sprints.length,
      closed: closedSprints.length,
      active: activeSprint ? { id: activeSprint.id, label: activeSprint.label, sprintNumber: activeSprint.sprintNumber } : null,
      next: nextSprint ? { id: nextSprint.id, label: nextSprint.label } : null,
    },
  });
}
