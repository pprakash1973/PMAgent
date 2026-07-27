import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const user = session.user as any;

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status");

  const where: any = { assignedToId: user.id };
  if (statusFilter) {
    where.status = { in: statusFilter.split(",") };
  }

  const items = await prisma.actionItem.findMany({
    where,
    orderBy: [{ dueDate: "asc" }, { priority: "asc" }],
    include: {
      project: { select: { id: true, name: true } },
      raisedBy: { select: { fullName: true } },
    },
  });

  const now = new Date();
  return NextResponse.json({
    items: items.map((i) => ({
      id: i.id,
      reference: i.reference,
      title: i.title,
      description: i.description,
      category: i.category,
      priority: i.priority,
      status: i.status,
      dueDate: i.dueDate?.toISOString() ?? null,
      isOverdue: i.dueDate ? i.dueDate < now && !["closed", "cancelled"].includes(i.status) : false,
      projectId: i.project.id,
      projectName: i.project.name,
      raisedByName: i.raisedBy.fullName,
      acknowledgedAt: i.acknowledgedAt?.toISOString() ?? null,
      blockedReason: i.blockedReason,
      pmResponse: i.pmResponse,
      createdAt: i.createdAt.toISOString(),
    })),
  });
}
