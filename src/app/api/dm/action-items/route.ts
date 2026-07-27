import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const user = session.user as any;
  if (!["dm", "pgm", "admin"].includes(user.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status");

  // Resolve scope — hierarchy: dm→Account, pgm→Program
  let projectScope: any;
  if (user.role === "admin") {
    projectScope = { orgId: user.orgId };
  } else if (user.role === "pgm") {
    const assignments = await prisma.programAssignment.findMany({ where: { userId: user.id }, select: { programId: true } });
    const programIds = assignments.map((a) => a.programId);
    if (programIds.length === 0) return NextResponse.json({ items: [] });
    projectScope = { programId: { in: programIds } };
  } else {
    const assignments = await prisma.accountAssignment.findMany({ where: { userId: user.id }, select: { accountId: true } });
    const accountIds = assignments.map((a) => a.accountId);
    if (accountIds.length === 0) return NextResponse.json({ items: [] });
    projectScope = { accountId: { in: accountIds } };
  }

  const where: any = {
    raisedById: user.role === "dm" ? user.id : undefined,
    project: projectScope,
  };
  if (statusFilter) where.status = { in: statusFilter.split(",") };

  const items = await prisma.actionItem.findMany({
    where,
    orderBy: [{ dueDate: "asc" }, { priority: "asc" }],
    include: {
      project: { select: { id: true, name: true } },
      assignedTo: { select: { fullName: true } },
    },
  });

  const now = new Date();
  return NextResponse.json({
    items: items.map((i) => ({
      id: i.id,
      reference: i.reference,
      title: i.title,
      category: i.category,
      priority: i.priority,
      status: i.status,
      dueDate: i.dueDate?.toISOString() ?? null,
      isOverdue: i.dueDate ? i.dueDate < now && !["closed", "cancelled"].includes(i.status) : false,
      projectId: i.project.id,
      projectName: i.project.name,
      assignedToName: i.assignedTo.fullName,
      createdAt: i.createdAt.toISOString(),
    })),
  });
}
