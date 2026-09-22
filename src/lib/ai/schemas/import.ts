import { z } from "zod";
import { cookingStepSchema } from "./cooking";

/**
 * Structured recipe extracted from pasted text, a photo of a recipe card, or a
 * webpage. This is the intermediate shape returned by the import AI route; the
 * server then adds a slug, source and owner before persisting it.
 */
export const importedRecipeSchema = z.object({
  title: z.string().min(1),
  description: z.string().max(500).optional(),
  minutes: z
    .number()
    .int()
    .positive()
    .describe("Total active + cooking time in minutes"),
  difficulty: z.enum(["easy", "medium", "hard"]),
  servings: z.number().int().positive(),
  ingredients: z
    .array(z.string())
    .min(1)
    .describe("Ingredients with rough quantities, e.g. '2 eggs'"),
  equipment: z
    .array(z.string())
    .describe("Cooking equipment needed, e.g. 'frying pan'"),
  steps: z.array(cookingStepSchema).min(1),
  tags: z.array(z.string()).default([]),
  whyGood: z
    .string()
    .max(200)
    .describe("One warm sentence for the recipe card")
    .optional(),
});

export type ImportedRecipe = z.infer<typeof importedRecipeSchema>;
