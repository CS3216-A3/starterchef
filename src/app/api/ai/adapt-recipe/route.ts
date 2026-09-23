import { z } from "zod";
import { measuredGenerate } from "@/lib/ai/instrument";
import { getModel } from "@/lib/ai/model";
import { renderPrompt } from "@/lib/ai/prompts";
import { AI_OPERATION_COSTS, withAiRoute } from "@/lib/ai/route";
import { adaptedRecipeSchema } from "@/lib/ai/schemas/recipe";

const requestSchema = z.object({
  request: z.string().min(1).max(1000),
  recipe: z.object({
    title: z.string(),
    description: z.string().optional(),
    minutes: z.number(),
    difficulty: z.string(),
    servings: z.number(),
    ingredients: z.array(z.string()),
    equipment: z.array(z.string()),
    steps: z.array(
      z.object({
        index: z.number(),
        title: z.string(),
        instruction: z.string(),
        durationSeconds: z.number().optional(),
        ingredients: z.array(z.string()),
        tip: z.string().optional(),
        photoCheckpoint: z.string().optional(),
      }),
    ),
  }),
});

/**
 * POST /api/ai/adapt-recipe
 * Chat-driven recipe customisation on the recipe overview page. Returns a
 * fully adapted recipe plus a changeSummary; the client shows it as a
 * suggestion the user can accept or dismiss — nothing is auto-applied.
 */
export const POST = withAiRoute({
  schema: requestSchema,
  cost: AI_OPERATION_COSTS.adapt,
  async handler({ input: { recipe, request: userRequest } }) {
    const recipeJson = JSON.stringify(recipe, null, 1);

    const { object } = await measuredGenerate("adapt-recipe", {
      model: getModel("adapt"),
      schema: adaptedRecipeSchema,
      temperature: 0.4,
      system: renderPrompt("adapt-recipe", {}),
      prompt: `Current recipe:\n${recipeJson}\n\nRequest: ${userRequest}`,
    });

    return Response.json(object);
  },
});
