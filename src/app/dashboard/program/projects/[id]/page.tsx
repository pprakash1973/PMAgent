import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import PgmProjectDetailClient from "./pgm-project-detail-client";

const CAN_PROGRAM = ["pgm", "admin"];

export default async function PgmProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session!.user as any;
  if (!CAN_PROGRAM.includes(user.role)) redirect("/dashboard");

  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      pmOwner:  { select: { id: true, fullName: true, email: true } },
      program:  { include: { client: { include: { cluster: true } } } },
      milestones: { orderBy: { dueDate: "asc" } },
      risks:      { orderBy: { createdAt: "desc" } },
      issues:     { orderBy: { createdAt: "desc" } },
      artifacts:  { orderBy: { createdAt: "desc" } },
      scheduleTasks: {
        select: {
          id: true, name: true, baselineStart: true, baselineFinish: true,
          baselineDays: true, percentComplete: true,
        },
        orderBy: { baselineStart: "asc" },
        take: 30,
      },
      costEntries: { select: { amount: true, date: true, category: true }, orderBy: { date: "desc" }, take: 20 },
      statusReports: {
        orderBy: { reportDate: "desc" },
        take: 10,
        include: { healthScore: true },
      },
      pmAssignments: {
        orderBy: { effectiveFrom: "desc" },
        take: 10,
        include: { user: { select: { fullName: true, email: true } } },
      },
      escalations: {
        where: { status: { in: ["open", "acknowledged", "in_progress"] } },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { raisedBy: { select: { fullName: true } } },
      },
    },
  });

  if (!project) notFound();

  // Scope check: pgm must have program assigned
  if (user.role === "pgm" && project.program?.id) {
    const assignment = await prisma.programAssignment.findFirst({
      where: { userId: user.id, programId: project.program.id },
    });
    if (!assignment) notFound();
  }

  // Live EVM
  const now = Date.now();
  let pv = 0, ev = 0;
  for (const t of project.scheduleTasks) {
    if (!t.baselineStart || !t.baselineFinish) continue;
    const s = new Date(t.baselineStart).getTime();
    const f = new Date(t.baselineFinish).getTime();
    const dur = f - s;
    const plannedPct = now <= s ? 0 : now >= f ? 1 : dur > 0 ? (now - s) / dur : 0;
    pv += t.baselineDays * plannedPct;
    ev += t.baselineDays * (t.percentComplete / 100);
  }
  const liveSpi = pv > 0 ? Math.round((ev / pv) * 100) / 100 : null;
  const storedSpi = project.statusReports[0]?.healthScore?.spi ?? null;
  const storedCpi = project.statusReports[0]?.healthScore?.cpi ?? null;
  const spi = liveSpi ?? storedSpi;

  const schedPct = project.scheduleTasks.length
    ? Math.round(project.scheduleTasks.reduce((s, t) => s + t.percentComplete, 0) / project.scheduleTasks.length)
    : 0;
  const totalSpent = project.costEntries.reduce((s, e) => s + e.amount, 0);
  const budPct = project.budget && project.budget > 0 ? Math.round((totalSpent / project.budget) * 100) : 0;

  let rag: "red" | "amber" | "green" = (project.healthStatus as any) ?? "green";
  if (spi !== null) {
    if (spi < 0.8) rag = "red";
    else if (spi < 0.9 && rag === "green") rag = "amber";
  }

  const serialized = JSON.parse(JSON.stringify({
    project,
    spi, cpi: storedCpi, schedPct, budPct, totalSpent, rag,
    userRole: user.role,
    userId: user.id,
  }));

  return (
    <AppShell role={user.role} userName={user.name ?? ""}>
      <PgmProjectDetailClient {...serialized} />
    </AppShell>
  );
}
