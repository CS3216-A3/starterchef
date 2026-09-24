import { z } from "zod";
import { measuredGenerate } from "@/lib/ai/instrument";
import { getModel } from "@/lib/ai/model";
import { renderPrompt } from "@/lib/ai/prompts";
import { AI_OPERATION_COSTS, withAiRoute } from "@/lib/ai/route";
import { recommendationRankingSchema } from "@/lib/ai/schemas/recommendations";
import { rankEligibleRecipes, validateAiRanking } from "@/lib/recommendations";
import type {
  KitchenItemRow,
  ProfileRow,
  RecipeFeedbackRow,
  RecipeRow,
} from "@/lib/types";

const requestSchema = z
  .object({
    maxMinutes: z.number().int().min(1).max(360).optional(),
    servings: z.number().int().min(1).max(12).optional(),
  })
  .strict();

/**
 * POST /api/ai/suggest-recipes
 * Ranks meal ideas against the user's inventory, dietary profile, skill, and
 * time budget. Returns RecipeSuggestions.
 */
export const POST = withAiRoute({
  schema: requestSchema,
  cost: AI_OPERATION_COSTS.suggestions,
  async loadContext({ input, supabase }) {
    const [recipesResult, pantryResult, profileResult, feedbackResult] =
      await Promise.all([
        supabase
          .from("recipes")
          .select("*")
          .order("minutes", { ascending: true }),
        supabase
          .from("kitchen_items")
          .select("*")
          .order("created_at", { ascending: true }),
        supabase.from("profiles").select("*").maybeSingle(),
        supabase
          .from("recipe_feedback")
          .select("recipe_id,rating,would_cook_again")
          .limit(100),
      ]);
    if (
      recipesResult.error ||
      pantryResult.error ||
      profileResult.error ||
      feedbackResult.error
    )
      throw new Error("trusted context failed");
    return rankEligibleRecipes(
      (recipesResult.data ?? []) as RecipeRow[],
      (pantryResult.data ?? []) as KitchenItemRow[],
      profileResult.data as ProfileRow | null,
      (feedbackResult.data ?? []) as RecipeFeedbackRow[],
      input,
    ).slice(0, 50);
  },
  shouldCharge(eligible) {
    return eligible.length > 0;
  },
  async handler({ trusted }) {
    if (trusted.length === 0) return Response.json({ recommendations: [] });
    const fallback = trusted.slice(0, 6).map((item) => ({
      ...item,
      reason: `Matches ${item.pantryMatches.length ? item.pantryMatches.join(", ") : "your current cooking preferences"}.`,
    }));
    try {
      const { object: generated } = await measuredGenerate("suggest-recipes", {
        model: getModel("suggestions"),
        schema: recommendationRankingSchema,
        temperature: 0.4,
        system: renderPrompt("recommendations", {
          candidates: JSON.stringify(
            trusted.map(({ recipe, pantryMatches }) => ({
              id: recipe.id,
              title: recipe.title,
              minutes: recipe.minutes,
              ingredients: recipe.ingredients,
              pantryMatches,
            })),
          ),
        }),
        prompt: "Rank the eligible recipes.",
      });
      const ranked = validateAiRanking(
        (generated as { rankings: Array<{ id: string; reason: string }> })
          .rankings,
        trusted,
      );
      return Response.json({
        recommendations: (ranked.length ? ranked : fallback).map(
          ({ recipe, reason }) => ({
            id: recipe.id,
            slug: recipe.slug,
            title: recipe.title,
            description: recipe.description,
            minutes: recipe.minutes,
            servings: recipe.servings,
            difficulty: recipe.difficulty,
            reason,
          }),
        ),
      });
    } catch {
      return Response.json({
        recommendations: fallback.map(({ recipe, reason }) => ({
          id: recipe.id,
          slug: recipe.slug,
          title: recipe.title,
          description: recipe.description,
          minutes: recipe.minutes,
          servings: recipe.servings,
          difficulty: recipe.difficulty,
          reason,
        })),
        fallback: true,
      });
    }
  },
});
