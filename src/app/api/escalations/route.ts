import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const CREATE_ROLES = ["pgm", "pm", "admin"];

// 2 working days from now (skip Sat/Sun)
function slaDeadline(from: Date): Date {
  const d = new Date(from);
  let days = 0;
  while (days < 2) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) days++;
  }
  return d;
}

const createSchema = z.object({
  targetType:           z.enum(["project", "risk"]).default("project"),
  projectId:            z.string().min(1),
  riskId:               z.string().optional(),
  severity:             z.enum(["critical", "high", "medium"]),
  title:                z.string().min(3).max(120),
  situation:            z.string().min(30),
  impact:               z.string().min(10),
  supportRequired:      z.string().min(10),
  targetResolutionDate: z.string().optional(),
  contextSnapshot:      z.any().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  const user = session?.user as any;
  if (!user || !CREATE_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;

  // Scope check for pgm: project must be in an assigned program
  if (user.role === "pgm") {
    const project = await prisma.project.findUnique({
      where: { id: data.projectId },
      select: { programId: true },
    });
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (project.programId) {
      const assignment = await prisma.programAssignment.findFirst({
        where: { userId: user.id, programId: project.programId },
      });
      if (!assignment) return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  // Rule S2: one open escalation per target
  const existing = await prisma.escalation.findFirst({
    where: {
      projectId: data.projectId,
      riskId: data.riskId ?? null,
      status: { in: ["open", "acknowledged", "in_progress"] },
    },
  });
  if (existing) {
    return NextResponse.json({ error: "duplicate", existingId: existing.id }, { status: 409 });
  }

  const now = new Date();
  const escalation = await prisma.escalation.create({
    data: {
      orgId:               user.orgId,
      targetType:          data.targetType,
      projectId:           data.projectId,
      riskId:              data.riskId ?? null,
      raisedById:          user.id,
      title:               data.title,
      description:         data.situation,
      situation:           data.situation,
      impact:              data.impact,
      supportRequired:     data.supportRequired,
      severity:            data.severity,
      status:              "open",
      slaDueAt:            slaDeadline(now),
      targetResolutionDate: data.targetResolutionDate ? new Date(data.targetResolutionDate) : null,
      contextSnapshot:     data.contextSnapshot ?? null,
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      orgId:    user.orgId,
      userId:   user.id,
      action:   "ESCALATION_RAISED",
      entity:   "Escalation",
      entityId: escalation.id,
      after:    { severity: data.severity, projectId: data.projectId, title: data.title },
    },
  }).catch(() => {});

  return NextResponse.json({ escalation }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  const user = session?.user as any;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const raisedByMe = searchParams.get("raised_by") === "me";
  const statusFilter = searchParams.get("status");
  const projectId = searchParams.get("project_id");

  const where: Record<string, unknown> = { orgId: user.orgId };

  if (raisedByMe || user.role === "pgm") {
    where.raisedById = user.id;
  }
  if (statusFilter) where.status = statusFilter;
  if (projectId) where.projectId = projectId;

  const escalations = await prisma.escalation.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      raisedBy: { select: { fullName: true } },
      project:  { select: { id: true, name: true, program: { select: { name: true } } } },
      risk:     { select: { id: true, description: true } },
      comments: { orderBy: { createdAt: "asc" }, include: { user: { select: { fullName: true } } } },
    },
  });

  return NextResponse.json({ escalations });
}
