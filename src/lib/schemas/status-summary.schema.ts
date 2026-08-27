import { z } from "zod";

export const StatusSummarySchema = z.object({
  summary:          z.string(),
  ragStatus:        z.enum(["green", "amber", "red"]),
  recommendations:  z.array(z.string()),
  accomplishments:  z.array(z.string()),
  nextWeekPlan:     z.array(z.string()),
  metricsNarrative: z.string(),
  assumptions:      z.array(z.string()),
  conflicts:        z.array(z.string()),
});

export type StatusSummary = z.infer<typeof StatusSummarySchema>;
