export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";
import { format, addDays } from "date-fns";
import { sendTaskActualsEmail } from "@/lib/email-smtp";
import { requireProjectAccess } from "@/lib/project-access";

// GET /api/projects/[id]/actuals/cycles — list cycles with compliance stats
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;


  const cycles = await prisma.collectionCycle.findMany({
    where: { projectId: id },
    orderBy: { cycleNumber: "desc" },
    include: {
      tokens: { select: { id: true, status: true, resourceId: true } },
      _count: { select: { actuals: true } },
    },
  });

  const result = cycles.map((c) => {
    const total = c.tokens.length;
    const submitted = c.tokens.filter((t) => t.status === "submitted").length;
    return {
      id: c.id,
      cycleNumber: c.cycleNumber,
      label: c.label,
      startDate: c.startDate,
      endDate: c.endDate,
      status: c.status,
      dispatchedAt: c.dispatchedAt,
      closedAt: c.closedAt,
      createdAt: c.createdAt,
      compliance: total > 0 ? Math.round((submitted / total) * 100) : 0,
      totalResources: total,
      submittedCount: submitted,
      actualsCount: c._count.actuals,
    };
  });

  return NextResponse.json(result);
}

// POST /api/projects/[id]/actuals/cycles — open a new cycle and optionally dispatch emails
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId);
  if (access.error) return access.error;

  const body = await req.json();
  const { label, startDate, endDate, dispatch = false, taskIds = [] } = body;

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 });
  }

  // Determine next cycle number
  const last = await prisma.collectionCycle.findFirst({
    where: { projectId },
    orderBy: { cycleNumber: "desc" },
    select: { cycleNumber: true },
  });
  const cycleNumber = (last?.cycleNumber ?? 0) + 1;

  // Resolve tasks — specific selection or all tasks
  const selectedIds: string[] = Array.isArray(taskIds) && taskIds.length > 0 ? taskIds : [];
  const tasks = await prisma.scheduleTask.findMany({
    where: {
      projectId,
      ...(selectedIds.length > 0 ? { id: { in: selectedIds } } : {}),
    },
    orderBy: { sortOrder: "asc" },
  });

  // Determine which resource IDs are relevant to the selected tasks.
  // When tasks are explicitly selected, only email resources assigned to those tasks.
  // When no tasks are selected (send to all), fall back to all project resources.
  let relevantResourceIds: Set<string> | null = null;
  if (selectedIds.length > 0) {
    const assignments = await prisma.taskAssignment.findMany({
      where: { taskId: { in: selectedIds }, projectId },
      select: { resourceId: true },
    });
    relevantResourceIds = new Set([
      ...assignments.map((a) => a.resourceId),
      ...tasks.filter((t) => t.resourceId).map((t) => t.resourceId as string),
    ]);
  }

  const resources = await prisma.projectResource.findMany({
    where: {
      projectId,
      email: { not: null },
      ...(relevantResourceIds ? { id: { in: Array.from(relevantResourceIds) } } : {}),
    },
  });

  if (resources.length === 0) {
    return NextResponse.json(
      { error: "No resources with email addresses found for the selected tasks. Add resource emails or check task assignments." },
      { status: 400 }
    );
  }

  // Fetch project info
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const tokenExpiryDays = 7;
  const expiresAt = addDays(new Date(), tokenExpiryDays);
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

  const cycle = await prisma.collectionCycle.create({
    data: {
      projectId,
      cycleNumber,
      label: label || `Cycle ${cycleNumber}`,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status: "open",
      taskIds: selectedIds.length > 0 ? selectedIds : [],
      createdBy: access.user.id,
      ...(dispatch ? { dispatchedAt: new Date() } : {}),
    },
  });

  // Create tokens for every resource
  const tokenPairs: Array<{ resourceId: string; rawToken: string; tokenHash: string }> = [];
  for (const resource of resources) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    tokenPairs.push({ resourceId: resource.id, rawToken, tokenHash });
  }

  const createdTokens = await prisma.$transaction(
    tokenPairs.map(({ resourceId, tokenHash }) =>
      prisma.collectionToken.create({
        data: {
          cycleId: cycle.id,
          resourceId,
          projectId,
          tokenHash,
          expiresAt,
          status: "pending",
        },
      })
    )
  );

  const emailResults: Array<{ resourceId: string; email: string; status: string; error?: string }> = [];

  if (dispatch) {
    const cyclePeriod = `${format(new Date(startDate), "d MMM")} – ${format(new Date(endDate), "d MMM yyyy")}`;
    const expiresAtStr = format(expiresAt, "d MMM yyyy, HH:mm");

    // Tasks with a resource assignment or all tasks if resource has any assignment
    const resourceTaskMap = new Map<string, typeof tasks>();
    for (const resource of resources) {
      // Get tasks explicitly assigned to this resource, or tasks where resource is primary
      const assignments = await prisma.taskAssignment.findMany({
        where: { resourceId: resource.id, projectId },
        select: { taskId: true },
      });
      const assignedTaskIds = new Set(assignments.map((a) => a.taskId));

      // Also include tasks where resource is the direct resource link
      const directTasks = tasks.filter((t) => t.resourceId === resource.id);
      const directTaskIds = new Set(directTasks.map((t) => t.id));

      const combined = new Set([...assignedTaskIds, ...directTaskIds]);
      const resourceTasks = tasks.filter((t) => combined.has(t.id));

      // Fall back to all tasks if none assigned
      resourceTaskMap.set(resource.id, resourceTasks.length > 0 ? resourceTasks : tasks);
    }

    for (let i = 0; i < resources.length; i++) {
      const resource = resources[i];
      const token = createdTokens[i];
      const rawToken = tokenPairs.find((p) => p.resourceId === resource.id)!.rawToken;
      const submitUrl = `${baseUrl}/api/public-submit/${rawToken}`;
      const resourceTasks = resourceTaskMap.get(resource.id) ?? tasks;

      try {
        await sendTaskActualsEmail({
          to: resource.email!,
          resourceName: resource.name,
          projectName: project.name,
          cyclePeriod,
          tasks: resourceTasks.map((t) => ({
            wbsCode: t.wbsCode,
            name: t.name,
            phase: t.phase,
            baselineStart: format(new Date(t.baselineStart), "d MMM"),
            baselineFinish: format(new Date(t.baselineFinish), "d MMM"),
            estimatedHours: t.estimatedHours,
            percentComplete: t.percentComplete,
          })),
          submitUrl,
          expiresAt: expiresAtStr,
        });

        await prisma.collectionToken.update({
          where: { id: token.id },
          data: { emailSentAt: new Date() },
        });

        emailResults.push({ resourceId: resource.id, email: resource.email!, status: "sent" });
      } catch (err) {
        emailResults.push({
          resourceId: resource.id,
          email: resource.email!,
          status: "failed",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  }

  return NextResponse.json(
    {
      cycle,
      tokensCreated: createdTokens.length,
      emailResults: dispatch ? emailResults : [],
    },
    { status: 201 }
  );
}
