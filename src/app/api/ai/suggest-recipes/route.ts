import { NextResponse } from "next/server";
import { z } from "zod";
import { measuredGenerate } from "@/lib/ai/instrument";
import { getModel } from "@/lib/ai/model";
import { renderPrompt } from "@/lib/ai/prompts";
import { recipeSuggestionsSchema } from "@/lib/ai/schemas/recipe";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

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
    const input = parsed.data;

    const { object } = await measuredGenerate("suggest-recipes", {
      model: getModel(),
      schema: recipeSuggestionsSchema,
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

    return NextResponse.json(object);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Recipe suggestion failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
