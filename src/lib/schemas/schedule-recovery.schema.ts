import { z } from "zod";

export const ScheduleRecoverySchema = z.object({
  headline:          z.string(),
  steps:             z.array(z.object({
    title:  z.string(),
    action: z.string(),
    effort: z.enum(["Low", "Medium", "High"]),
    impact: z.enum(["Low", "Medium", "High"]),
  })),
  estimatedRecovery: z.string(),
  assumptions:       z.array(z.string()),
  conflicts:         z.array(z.string()),
});

export type ScheduleRecovery = z.infer<typeof ScheduleRecoverySchema>;
