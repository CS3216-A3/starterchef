import { z } from "zod";
import { importedRecipeSchema } from "./import";

export const photoSourceAssessmentSchema = z.object({
  sourceType: z.enum(["recipe_card", "finished_dish", "unusable"]),
  summary: z.string().trim().min(1).max(500),
  visibleFacts: z.array(z.string().trim().min(1).max(200)).max(8),
  uncertainties: z.array(z.string().trim().min(1).max(200)).max(8),
  clarificationQuestion: z.string().trim().min(1).max(500).nullable(),
});

export const photoRecipeResultSchema = z.object({
  recipe: importedRecipeSchema,
  assumptions: z.array(z.string().trim().min(1).max(200)).max(8),
});

export type PhotoSourceAssessment = z.infer<typeof photoSourceAssessmentSchema>;
export type PhotoRecipeResult = z.infer<typeof photoRecipeResultSchema>;
