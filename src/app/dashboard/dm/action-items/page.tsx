import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { DmActionItemsClient } from "./dm-action-items-client";

export const dynamic = "force-dynamic";

export default async function DmActionItemsPage() {
  const session = await auth();
  const user = session!.user as any;
  if (!["dm", "pgm", "admin"].includes(user.role)) redirect("/dashboard");

  let accountIds: string[] = [];
  if (user.role === "admin") {
    const accounts = await prisma.orgAccount.findMany({ where: { orgId: user.orgId, deletedAt: null }, select: { id: true } });
    accountIds = accounts.map((a) => a.id);
  } else {
    const assignments = await prisma.accountAssignment.findMany({ where: { userId: user.id }, select: { accountId: true } });
    accountIds = assignments.map((a) => a.accountId);
  }

  const items = accountIds.length === 0 ? [] : await prisma.actionItem.findMany({
    where: {
      raisedById: user.role === "dm" ? user.id : undefined,
      project: { accountId: { in: accountIds } },
    },
    orderBy: [{ dueDate: "asc" }, { priority: "asc" }],
    include: {
      project: { select: { id: true, name: true } },
      assignedTo: { select: { fullName: true } },
    },
  });

  const now = new Date();
  const serialized = items.map((i) => ({
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
  }));

  return <DmActionItemsClient items={serialized} />;
}
