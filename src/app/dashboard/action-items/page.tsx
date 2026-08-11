import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { ActionItemsClient } from "../action-items-client";

export const dynamic = "force-dynamic";

export default async function PmActionItemsPage() {
  const session = await auth();
  const user = session!.user as any;
  if (user.role !== "pm" && user.role !== "admin") redirect("/dashboard");

  const now = new Date();

  const items = await prisma.actionItem.findMany({
    where: {
      assignedToId: user.role === "pm" ? user.id : undefined,
    },
    orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
    include: {
      project: { select: { id: true, name: true } },
      raisedBy: { select: { fullName: true } },
    },
  });

  const serialized = items.map((ai) => ({
    id: ai.id,
    reference: ai.reference,
    title: ai.title,
    priority: ai.priority,
    status: ai.status,
    dueDate: ai.dueDate?.toISOString() ?? null,
    project: { id: ai.project.id, name: ai.project.name },
    raisedBy: { fullName: ai.raisedBy.fullName },
  }));

  const overdueCount = items.filter(
    (i) => i.dueDate && i.dueDate < now && !["closed", "cancelled"].includes(i.status)
  ).length;

  return (
    <div style={{ padding: "28px 32px", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#003C51", margin: 0 }}>My Action Items</h1>
        <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
          All action items assigned to you by your Delivery Manager
          {overdueCount > 0 && (
            <span style={{ color: "#cf3f3a", fontWeight: 600 }}> · {overdueCount} overdue</span>
          )}
        </p>
      </div>
      <ActionItemsClient items={serialized} overdueCount={overdueCount} />
    </div>
  );
}
