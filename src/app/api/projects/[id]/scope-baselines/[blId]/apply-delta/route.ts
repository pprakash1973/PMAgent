export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; blId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id, blId } = await params;

  const body = await req.json();
  const {
    acceptedMilestones = [],
    reviewed = false,
    applyWbsDelta = false,
  } = body as {
    acceptedMilestones?: { milestoneName: string; estimatedDaysFromEnd?: number }[];
    reviewed?: boolean;
    applyWbsDelta?: boolean;
  };

  const baseline = await (prisma as any).scopeBaseline.findFirst({
    where: { id: blId, projectId: id },
  });
  if (!baseline) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const results: string[] = [];

  // Create accepted milestone records
  if (acceptedMilestones.length > 0) {
    const lastMilestone = await prisma.milestone.findFirst({
      where: { projectId: id },
      orderBy: { dueDate: "desc" },
    });
    const baseDate = lastMilestone?.dueDate ?? new Date();

    for (const m of acceptedMilestones) {
      const daysToAdd = m.estimatedDaysFromEnd ?? 14;
      const dueDate = new Date(baseDate);
      dueDate.setDate(dueDate.getDate() + daysToAdd);
      await prisma.milestone.create({
        data: {
          projectId: id,
          name: m.milestoneName,
          dueDate,
          status: "pending",
          notes: `Added via Scope Control — BL v${baseline.version}`,
        },
      });
      results.push(`Milestone created: ${m.milestoneName}`);
    }
  }

  // Materialize WBS delta into ScheduleTask rows
  if (applyWbsDelta) {
    const impactSummary = baseline.impactSummary as any;
    const wbsDelta: any[] = impactSummary?.wbsDelta ?? [];

    if (wbsDelta.length > 0) {
      // Load existing tasks for matching
      const existingTasks = await prisma.scheduleTask.findMany({
        where: { projectId: id },
        orderBy: { sortOrder: "asc" },
      });
      const maxSortOrder = existingTasks.reduce((max, t) => Math.max(max, t.sortOrder ?? 0), 0);

      // Get project start for baseline date calculation
      const project = await prisma.project.findUnique({ where: { id } });
      const baseStart = project?.startDate ? new Date(project.startDate) : new Date();

      let nextSort = maxSortOrder + 1;

      for (const delta of wbsDelta) {
        if (delta.action === "add") {
          // Create a new ScheduleTask for the added work package
          const estimatedDays = Number(delta.estimatedDays ?? 5);
          // Place it after the last existing task
          const lastFinish = existingTasks[existingTasks.length - 1]?.baselineFinish ?? baseStart;
          const taskStart = new Date(lastFinish);
          // Skip weekends
          while (taskStart.getDay() === 0 || taskStart.getDay() === 6) {
            taskStart.setDate(taskStart.getDate() + 1);
          }
          const taskFinish = new Date(taskStart);
          taskFinish.setDate(taskFinish.getDate() + estimatedDays);

          await prisma.scheduleTask.create({
            data: {
              projectId: id,
              wbsCode: `CR-${delta.linkedReqKey ?? nextSort}`,
              name: String(delta.workPackageName ?? "New work package"),
              phase: String(delta.phase ?? "Change Request"),
              owner: "",
              resourceId: null,
              sortOrder: nextSort,
              baselineStart: taskStart,
              baselineFinish: taskFinish,
              baselineDays: estimatedDays,
              dependencies: [],
              percentComplete: 0,
              status: "not_started",
            },
          });
          nextSort++;
          results.push(`WBS task added: ${delta.workPackageName}`);
        } else if (delta.action === "flag") {
          // Find matching task by name (case-insensitive) and mark descoped if no progress
          const name = String(delta.workPackageName ?? "").toLowerCase();
          const match = existingTasks.find(t =>
            t.name.toLowerCase().includes(name) || name.includes(t.name.toLowerCase())
          );
          if (match && (match.percentComplete ?? 0) === 0) {
            await prisma.scheduleTask.update({
              where: { id: match.id },
              data: { status: "descoped" },
            });
            results.push(`WBS task flagged as descoped: ${match.name}`);
          } else if (match) {
            results.push(`WBS task has progress, skipped de-scope flag: ${match.name}`);
          }
        }
      }

      // Re-stamp the WBS and Schedule artifacts with this baseline's id
      await prisma.artifact.updateMany({
        where: {
          projectId: id,
          artifactType: { in: ["wbs", "milestone_plan"] },
        },
        data: { scopeBaselineId: blId },
      });
      results.push("WBS and Schedule artifacts re-stamped with new baseline");
    }
  }

  // Mark delta as reviewed
  if (reviewed) {
    await (prisma as any).scopeBaseline.update({
      where: { id: blId },
      data: { deltaReviewed: true },
    });
  }

  return NextResponse.json({ ok: true, results });
}
