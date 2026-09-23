import { z } from "zod";
import { measuredGenerate } from "@/lib/ai/instrument";
import { getModel } from "@/lib/ai/model";
import { renderPrompt } from "@/lib/ai/prompts";
import { AI_OPERATION_COSTS, withAiRoute } from "@/lib/ai/route";
import { recipeSuggestionsSchema } from "@/lib/ai/schemas/recipe";

const requestSchema = z.object({
  ingredients: z.array(z.string()).default([]),
  equipment: z.array(z.string()).default([]),
  dietaryRestrictions: z.array(z.string()).default([]),
  allergies: z.array(z.string()).default([]),
  tastePreferences: z.array(z.string()).default([]),
  skillLevel: z
    .enum(["beginner", "intermediate", "advanced"])
    .default("beginner"),
  timeMinutes: z.number().int().positive().optional(),
  servings: z.number().int().positive().optional(),
});

/**
 * POST /api/ai/suggest-recipes
 * Ranks meal ideas against the user's inventory, dietary profile, skill, and
 * time budget. Returns RecipeSuggestions.
 */
export const POST = withAiRoute({
  schema: requestSchema,
  cost: AI_OPERATION_COSTS.suggestions,
  async handler({ input }) {
    const { object } = await measuredGenerate("suggest-recipes", {
      model: getModel("suggestions"),
      schema: recipeSuggestionsSchema,
      temperature: 0.4,
      system: renderPrompt("suggest-recipes", {
        ingredients: input.ingredients.join(", ") || "none listed",
        equipment: input.equipment.join(", ") || "none listed",
        dietaryRestrictions: input.dietaryRestrictions.join(", ") || "none",
        allergies: input.allergies.join(", ") || "none",
        tastePreferences: input.tastePreferences.join(", ") || "none",
        skillLevel: input.skillLevel,
        timeMinutes: input.timeMinutes?.toString() ?? "no limit",
        servings: input.servings?.toString() ?? "1",
      }),
      prompt: "Suggest meals I can cook tonight.",
    });

    return Response.json(object);
  },
});
