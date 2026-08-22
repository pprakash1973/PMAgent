import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireProjectAccess } from "@/lib/project-access";
import { nextSequentialId } from "@/lib/sequential-id";

export const dynamic = "force-dynamic";

// Generate a human-readable reference like AI-PRJ014-007
async function generateReference(projectId: string): Promise<string> {
  const shortId = projectId.slice(-6).toUpperCase();
  const existing = await prisma.actionItem.findMany({
    where: { projectId },
    select: { reference: true },
  });
  return nextSequentialId(existing.map((a) => a.reference), `AI-${shortId}`);
}

// Add N working days to a date
function addWorkingDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d;
}

const DEFAULT_WORKING_DAYS: Record<string, number> = { p1: 2, p2: 5, p3: 15 };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;
  const user = access.user;


  const items = await prisma.actionItem.findMany({
    where: { projectId: id },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    include: {
      raisedBy: { select: { fullName: true } },
      assignedTo: { select: { fullName: true } },
    },
  });

  return NextResponse.json({ items });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;
  const user = access.user;

  if (!["dm", "pgm", "admin", "dh"].includes(user.role)) {
    return NextResponse.json({ error: "FORBIDDEN — only DM/DH/Admin can create action items" }, { status: 403 });
  }


  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Scope check — mirrors dm-review route exactly (supports unassigned projects)
  const isUnassigned = project.accountId === null && project.programId === null;
  if (user.role === "dm") {
    if (!isUnassigned) {
      if (!project.accountId) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      const assignment = await prisma.accountAssignment.findFirst({
        where: { userId: user.id, accountId: project.accountId },
      });
      if (!assignment) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
  } else if (user.role === "pgm") {
    if (!project.programId) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const assignment = await prisma.programAssignment.findFirst({
      where: { userId: user.id, programId: project.programId },
    });
    if (!assignment) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await req.json();
  const { title, description, category, priority, dueDate, expectedOutcome } = body;

  if (!title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 422 });
  if (priority === "p1" && (!description || description.trim().length < 40)) {
    return NextResponse.json({ error: "P1 items require a description of at least 40 characters" }, { status: 422 });
  }

  // Resolve the PM for this project
  const assignedToId = project.pmOwnerId;

  // Compute due date: use provided or default from priority
  const resolvedDueDate = dueDate
    ? new Date(dueDate)
    : addWorkingDays(new Date(), DEFAULT_WORKING_DAYS[priority ?? "p2"] ?? 5);

  let reference: string;
  try {
    reference = await generateReference(id);
  } catch (err: any) {
    console.error("[action-items] generateReference failed:", err?.message);
    return NextResponse.json({ error: "Database error generating reference — run prisma db push if tables are missing." }, { status: 500 });
  }

  let actionItem: any;
  try {
    actionItem = await prisma.actionItem.create({
      data: {
        reference,
        projectId: id,
        title: title.trim(),
        description: description?.trim() ?? null,
        category: category ?? "schedule",
        priority: priority ?? "p2",
        dueDate: resolvedDueDate,
        originalDueDate: resolvedDueDate,
        assignedToId,
        raisedById: user.id,
        source: "manual",
        expectedOutcome: expectedOutcome?.trim() ?? null,
        status: "open",
      },
    });
  } catch (err: any) {
    console.error("[action-items] create failed:", err?.message);
    return NextResponse.json({ error: "Failed to create action item." }, { status: 500 });
  }

  // Write initial event (non-fatal if event table isn't migrated yet)
  try {
    await prisma.actionItemEvent.create({
      data: {
        actionItemId: actionItem.id,
        actorId: user.id,
        fromStatus: "created",
        toStatus: "open",
      },
    });
  } catch {
    // Non-fatal — action item was created successfully
  }

  return NextResponse.json({ actionItem }, { status: 201 });
}
