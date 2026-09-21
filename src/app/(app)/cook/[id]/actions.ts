"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Ensure there's an in-progress cooking_sessions row for this recipe.
 * If the user already has one for the same slug we keep it (so "Already
 * cooking" resumes); a session for a *different* recipe is left alone too —
 * the card on /today just points at whichever is newest.
 */
export async function startCookingSession(recipeSlug: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: recipe } = await supabase
    .from("recipes")
    .select("slug, title, steps")
    .eq("slug", recipeSlug)
    .maybeSingle();
  if (!recipe) return { error: "Recipe not found" };

  const { data: existing } = await supabase
    .from("cooking_sessions")
    .select("id, recipe")
    .eq("user_id", user.id)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const existingSlug = (existing?.recipe as { slug?: string } | null)?.slug;
  if (existing && existingSlug === recipeSlug) {
    return { ok: true, sessionId: existing.id };
  }

  const { data: session, error } = await supabase
    .from("cooking_sessions")
    .insert({
      user_id: user.id,
      recipe: {
        slug: recipe.slug,
        title: recipe.title,
        steps: recipe.steps,
      },
      current_step: 1,
      status: "in_progress",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { ok: true, sessionId: session.id };
}

/** Mark the user's active session completed when they finish cooking. */
export async function completeCookingSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("cooking_sessions")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("status", "in_progress");
}
