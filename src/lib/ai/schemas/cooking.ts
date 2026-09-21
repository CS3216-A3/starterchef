import { z } from "zod";

/**
 * Structured recipe steps extracted from a recipe source (video link, photo
 * of a recipe card, pasted text) or generated from a suggestion.
 */
export const cookingStepSchema = z.object({
  index: z.number().int().min(1),
  title: z
    .string()
    .describe("Short imperative title, e.g. 'Soften the tomatoes'"),
  instruction: z
    .string()
    .describe("1–2 sentences, beginner-friendly, no jargon"),
  durationSeconds: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Set when the step has a natural timer"),
  ingredientsUsed: z.array(z.string()),
  tip: z.string().optional(),
  photoCheckpoint: z
    .string()
    .optional()
    .describe(
      "What a correct result looks like, for the optional photo-checkpoint feature",
    ),
});

export const recipeStepsSchema = z.object({
  steps: z.array(cookingStepSchema).min(1),
});

export type CookingStep = z.infer<typeof cookingStepSchema>;
export type RecipeSteps = z.infer<typeof recipeStepsSchema>;
