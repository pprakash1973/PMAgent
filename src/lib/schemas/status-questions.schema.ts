import { z } from "zod";

export const StatusQuestionSchema = z.object({
  id:               z.number(),
  category:         z.string(),
  question:         z.string(),
  type:             z.enum(["chips", "multi-chips", "number", "select"]),
  suggestedAnswers: z.array(z.string()),
  allowCustom:      z.boolean(),
  required:         z.boolean(),
  placeholder:      z.string().optional(),
  unit:             z.string().optional(),
});

export const StatusQuestionsSchema = z.object({
  questions: z.array(StatusQuestionSchema),
});

export type StatusQuestion  = z.infer<typeof StatusQuestionSchema>;
export type StatusQuestions = z.infer<typeof StatusQuestionsSchema>;
