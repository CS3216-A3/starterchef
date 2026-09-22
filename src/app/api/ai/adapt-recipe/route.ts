import { NextResponse } from "next/server";
import { z } from "zod";
import { measuredGenerate } from "@/lib/ai/instrument";
import { getModel } from "@/lib/ai/model";
import { renderPrompt } from "@/lib/ai/prompts";
import { adaptedRecipeSchema } from "@/lib/ai/schemas/recipe";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { friendlyAiError } from "@/lib/ai/errors";

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
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = await checkRateLimit(user.id);
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit);
    }

    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { recipe, request: userRequest } = parsed.data;

    const recipeJson = JSON.stringify(recipe, null, 1);

    const { object } = await measuredGenerate("adapt-recipe", {
      model: getModel(),
      schema: adaptedRecipeSchema,
      temperature: 0.4,
      system: renderPrompt("adapt-recipe", {}),
      prompt: `Current recipe:\n${recipeJson}\n\nRequest: ${userRequest}`,
    });

    return NextResponse.json(object);
  } catch (err) {
    const message = friendlyAiError(err, "Recipe adaptation failed");
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
