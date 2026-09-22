import { NextResponse } from "next/server";
import { generateText, stepCountIs } from "ai";
import { z } from "zod";
import { getModel } from "@/lib/ai/model";
import { renderPrompt } from "@/lib/ai/prompts";
import {
  createRecipeEditTools,
  type EditableRecipe,
} from "@/lib/ai/recipe-edit-tools";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  request: z.string().min(1).max(1000),
  recipe: z.object({
    title: z.string(),
    description: z.string().default(""),
    minutes: z.number(),
    difficulty: z.enum(["easy", "medium", "hard"]),
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
    tags: z.array(z.string()).default([]),
    why_good: z.string().default(""),
  }),
});

/**
 * POST /api/ai/edit-recipe
 * Tool-driven recipe editing: the model mutates a server-side working copy
 * through constrained tools (updateMeta/setIngredients/updateStep/...) so
 * the result is always a valid recipe — no hallucinated free-form JSON.
 * Returns the full edited recipe + a changeSummary. Nothing is persisted;
 * the client applies or dismisses the suggestion.
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

    const working: EditableRecipe = JSON.parse(
      JSON.stringify(parsed.data.recipe),
    );
    const { tools, changes } = createRecipeEditTools(working);

    const result = await generateText({
      model: getModel(),
      tools,
      stopWhen: stepCountIs(12),
      temperature: 0.3,
      system: renderPrompt("edit-recipe", {}),
      prompt: `Current recipe:\n${JSON.stringify(parsed.data.recipe, null, 1)}\n\nRequest: ${parsed.data.request}`,
      telemetry: { functionId: "edit-recipe" },
    });

    return NextResponse.json({
      changeSummary:
        result.text?.trim() ||
        (changes.length ? changes.join(". ") : "No changes made."),
      title: working.title,
      description: working.description,
      minutes: working.minutes,
      difficulty: working.difficulty,
      servings: working.servings,
      ingredients: working.ingredients,
      equipment: working.equipment,
      steps: working.steps.map((s) => ({
        index: s.index,
        title: s.title,
        instruction: s.instruction,
        durationSeconds: s.durationSeconds,
        ingredientsUsed: s.ingredients,
        tip: s.tip,
        photoCheckpoint: s.photoCheckpoint,
      })),
      tags: working.tags,
      whyGood: working.why_good,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Recipe edit failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
