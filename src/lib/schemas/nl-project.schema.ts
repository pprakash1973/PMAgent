import { z } from "zod";

export const NlProjectSchema = z.object({
  name:               z.string().nullable(),
  customer:           z.string().nullable(),
  projectType:        z.string().nullable(),
  methodology:        z.string().nullable(),
  industry:           z.string().nullable(),
  projectSize:        z.string().nullable(),
  budget:             z.number().nullable(),
  currency:           z.string().nullable(),
  deliveryModel:      z.string().nullable(),
  teamSize:           z.number().nullable(),
  startDate:          z.string().nullable(),
  endDate:            z.string().nullable(),
  description:        z.string().nullable(),
  objectives:         z.array(z.string()),
  scopeIncludes:      z.array(z.string()),
  scopeExcludes:      z.array(z.string()),
  constraints:        z.array(z.string()),
  assumptions:        z.array(z.string()),
  conflicts:          z.array(z.string()),
  sponsor:            z.string().nullable(),
  clarifyingQuestions: z.array(z.string()),
});

export type NlProject = z.infer<typeof NlProjectSchema>;
