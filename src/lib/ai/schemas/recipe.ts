import { z } from "zod";

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
