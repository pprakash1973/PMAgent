import { z } from "zod";
import { prisma } from "@/lib/db";

// Valid confidence dispositions — mirrors the DISPOSITIONS list in the submit UI
// and the schema comment on TaskActualsLedger.disposition.
export const DISPOSITIONS = [
  "confirmed_as_planned",
  "actual",
  "forecast",
  "estimated",
  "unknown",
] as const;

// A single task actuals submission. Bounds are generous enough for any real
// collection cycle (which can span multiple weeks) while rejecting the
// corruption/overflow values called out in the security review
// (negative, NaN, Infinity/1e400, or astronomically large numbers).
// Note: .min/.max already reject NaN and ±Infinity because the comparisons
// return false for those values.
const submissionSchema = z.object({
  taskId:          z.string().min(1).max(64),
  hoursWorked:     z.number().min(0).max(10000),
  percentComplete: z.number().min(0).max(100),
  etcHours:        z.number().min(0).max(100000).nullish(),
  disposition:     z.enum(DISPOSITIONS),
  notes:           z.string().max(5000).nullish(),
});

export const submissionsPayloadSchema = z.object({
  submissions: z.array(submissionSchema).min(1).max(200),
});

export type Submission = z.infer<typeof submissionSchema>;

/**
 * Compute the set of task IDs a resource is authorised to view or submit for a
 * given cycle. This is the single authorization boundary shared by the GET
 * (task listing) and POST (actuals write) paths.
 *
 * Rules (deliberately never widen to "all project tasks"):
 *  - If the resource owns tasks (via TaskAssignment or a direct ScheduleTask
 *    link), they may only touch THOSE tasks — intersected with the cycle's
 *    explicit selection when the PM chose specific tasks. This closes the
 *    cross-resource submission bypass.
 *  - If the resource owns no identifiable tasks, the only legitimate scope is
 *    the PM's explicit cycle selection. If the cycle has no selection either,
 *    the resource gets an empty set (nothing to see or submit) rather than the
 *    entire project's task list.
 */
export async function computeAllowedTaskIds(opts: {
  projectId: string;
  resourceId: string;
  cycleTaskIds: string[];
}): Promise<Set<string>> {
  const { projectId, resourceId, cycleTaskIds } = opts;

  const [assignments, directTasks] = await Promise.all([
    prisma.taskAssignment.findMany({
      where: { resourceId, projectId },
      select: { taskId: true },
    }),
    prisma.scheduleTask.findMany({
      where: { resourceId, projectId },
      select: { id: true },
    }),
  ]);

  const resourceTaskIds = new Set<string>([
    ...assignments.map((a) => a.taskId),
    ...directTasks.map((t) => t.id),
  ]);

  if (resourceTaskIds.size > 0) {
    if (cycleTaskIds.length > 0) {
      return new Set(cycleTaskIds.filter((id) => resourceTaskIds.has(id)));
    }
    return resourceTaskIds;
  }

  if (cycleTaskIds.length > 0) return new Set(cycleTaskIds);
  return new Set();
}
