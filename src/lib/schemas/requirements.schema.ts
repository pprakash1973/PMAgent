import { z } from "zod";

const StakeholderSchema = z.object({
  name:     z.string(),
  role:     z.string(),
  interest: z.string(),
});

export const RequirementsSchema = z.object({
  goals:          z.array(z.string()),
  scopeItems:     z.array(z.string()),
  outOfScope:     z.array(z.string()),
  stakeholders:   z.array(StakeholderSchema),
  constraints:    z.array(z.string()),
  assumptions:    z.array(z.string()),
  conflicts:      z.array(z.string()),
  timeline:       z.string(),
  budgetSignals:  z.string(),
  methodology:    z.string(),
  risks:          z.array(z.string()),
  sourceCharsProcessed: z.number().optional(),
  sourceCharsTotal:     z.number().optional(),
});

export type Requirements = z.infer<typeof RequirementsSchema>;
