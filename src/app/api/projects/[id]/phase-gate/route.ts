export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const PHASE_ORDER = ["initiation", "planning", "execution", "closure"] as const;
type Phase = (typeof PHASE_ORDER)[number];

// Artifacts required to EXIT each phase (must exist, status != "draft")
const PHASE_GATE_ARTIFACTS: Record<Phase, string[]> = {
  initiation: ["project_charter"],
  planning: ["wbs", "risk_register"],
  execution: ["weekly_status"],
  closure: ["lessons_learned"],
};

// Human-readable labels for gate items
const ARTIFACT_LABELS: Record<string, string> = {
  project_charter: "Project Charter",
  wbs: "Work Breakdown Structure",
  risk_register: "Risk Register",
  weekly_status: "Weekly Status Report",
  lessons_learned: "Lessons Learned Register",
};

function nextPhase(current: string): Phase | null {
  const idx = PHASE_ORDER.indexOf(current as Phase);
  if (idx === -1 || idx === PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[idx + 1];
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const user = session.user as any;

  const project = await prisma.project.findUnique({
    where: { id, orgId: user.orgId, deletedAt: null },
    include: {
      artifacts: { select: { artifactType: true, status: true } },
      milestones: { select: { status: true } },
      issues: { where: { status: "open", severity: "critical" }, select: { id: true } },
    },
  });

  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const current = project.currentPhase || "initiation";
  const next = nextPhase(current);

  if (!next) {
    return NextResponse.json({ current, next: null, canAdvance: false, gates: [] });
  }

  const requiredArtifacts = PHASE_GATE_ARTIFACTS[current as Phase] ?? [];
  const artifactMap = new Map(project.artifacts.map((a) => [a.artifactType, a.status]));

  const gates = requiredArtifacts.map((type) => {
    const status = artifactMap.get(type);
    const met = !!status && status !== "draft";
    return {
      key: type,
      label: ARTIFACT_LABELS[type] ?? type,
      met,
      hint: met ? undefined : `Generate the ${ARTIFACT_LABELS[type] ?? type} artifact first`,
    };
  });

  // Extra gate: no critical open issues in execution→closure
  if (current === "execution") {
    const criticalOpen = project.issues.length > 0;
    gates.push({
      key: "no_critical_issues",
      label: "No critical open issues",
      met: !criticalOpen,
      hint: criticalOpen ? "Resolve all critical issues before closing" : undefined,
    });
  }

  const canAdvance = gates.every((g) => g.met);

  return NextResponse.json({ current, next, canAdvance, gates });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const user = session.user as any;
  const body = await req.json().catch(() => ({}));
  const override = body.override === true;
  const justification = body.justification as string | undefined;

  if (override && !["delivery_manager", "delivery_head", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const project = await prisma.project.findUnique({
    where: { id, orgId: user.orgId, deletedAt: null },
    include: {
      artifacts: { select: { artifactType: true, status: true } },
      issues: { where: { status: "open", severity: "critical" }, select: { id: true } },
    },
  });

  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const current = project.currentPhase || "initiation";
  const next = nextPhase(current);
  if (!next) return NextResponse.json({ error: "ALREADY_CLOSED" }, { status: 400 });

  if (!override) {
    const requiredArtifacts = PHASE_GATE_ARTIFACTS[current as Phase] ?? [];
    const artifactMap = new Map(project.artifacts.map((a) => [a.artifactType, a.status]));
    const unmet = requiredArtifacts.filter((type) => {
      const status = artifactMap.get(type);
      return !status || status === "draft";
    });
    if (current === "execution") {
      if (project.issues.length > 0) unmet.push("no_critical_issues");
    }
    if (unmet.length > 0) {
      return NextResponse.json({ error: "GATE_BLOCKED", unmet }, { status: 422 });
    }
  }

  await prisma.project.update({
    where: { id },
    data: { currentPhase: next },
  });

  await prisma.auditLog.create({
    data: {
      orgId: user.orgId,
      userId: user.id,
      action: "phase_advance",
      entity: "project",
      entityId: id,
      before: { phase: current },
      after: { phase: next, override, justification: justification ?? null },
    },
  });

  return NextResponse.json({ current: next, previous: current });
}
