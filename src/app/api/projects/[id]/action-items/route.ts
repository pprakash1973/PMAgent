import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Generate a human-readable reference like AI-PRJ014-007
async function generateReference(projectId: string): Promise<string> {
  const count = await prisma.actionItem.count({ where: { projectId } });
  const shortId = projectId.slice(-6).toUpperCase();
  return `AI-${shortId}-${String(count + 1).padStart(3, "0")}`;
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
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const user = session.user as any;

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
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const user = session.user as any;
  if (!["dm", "pgm", "admin", "dh"].includes(user.role)) {
    return NextResponse.json({ error: "FORBIDDEN — only DM/DH/Admin can create action items" }, { status: 403 });
  }

  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // DM scope check
  if (user.role === "dm") {
    const assignment = await prisma.accountAssignment.findFirst({
      where: { userId: user.id, accountId: project.accountId ?? "" },
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

  const reference = await generateReference(id);

  const actionItem = await prisma.actionItem.create({
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

  // Write initial event
  await prisma.actionItemEvent.create({
    data: {
      actionItemId: actionItem.id,
      actorId: user.id,
      fromStatus: "created",
      toStatus: "open",
    },
  });

  return NextResponse.json({ actionItem }, { status: 201 });
}
