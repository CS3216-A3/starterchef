import { z } from "zod";
import { cookingStepSchema } from "./cooking";

export const recipeSuggestionSchema = z.object({
  title: z.string(),
  description: z.string(),
  prepMinutes: z.number().int().positive(),
  cookMinutes: z.number().int().positive(),
  servings: z.number().int().positive(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  matchedIngredients: z
    .array(z.string())
    .describe("Ingredients the user already has that this recipe uses"),
  missingIngredients: z
    .array(z.string())
    .describe("Ingredients the user would need to buy or substitute"),
  requiredEquipment: z
    .array(z.string())
    .describe(
      "Equipment the recipe needs — must intersect the user's inventory",
    ),
  whyThisRecipe: z
    .string()
    .describe(
      "One warm, specific sentence referencing the user's ingredients or preferences",
    ),
  tags: z.array(z.string()),
});

export const recipeSuggestionsSchema = z.object({
  suggestions: z.array(recipeSuggestionSchema).min(1).max(6),
});

export type RecipeSuggestion = z.infer<typeof recipeSuggestionSchema>;
export type RecipeSuggestions = z.infer<typeof recipeSuggestionsSchema>;

/**
 * A fully adapted recipe returned by the customisation chat, plus a human
 * summary of what changed. Mirrors the import shape so the result can be
 * persisted directly as a personalised copy.
 */
export const adaptedRecipeSchema = z.object({
  changeSummary: z
    .string()
    .max(300)
    .describe("One or two sentences explaining what changed and why"),
  title: z.string().min(1),
  description: z.string().max(500).optional(),
  minutes: z.number().int().positive(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  servings: z.number().int().positive(),
  ingredients: z.array(z.string()).min(1),
  equipment: z.array(z.string()),
  steps: z.array(cookingStepSchema).min(1),
  tags: z.array(z.string()).default([]),
  whyGood: z.string().max(200).optional(),
});

export type AdaptedRecipe = z.infer<typeof adaptedRecipeSchema>;
