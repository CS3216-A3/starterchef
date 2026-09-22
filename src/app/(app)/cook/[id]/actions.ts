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

/**
 * Attach a user-taken photo to a cooking step. Owned recipes get the photo
 * written into their steps jsonb; for catalogue recipes it's stored on the
 * in-progress session snapshot instead so it stays per-user.
 */
export async function saveStepPhoto(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const file = formData.get("file");
  const recipeId = String(formData.get("recipeId") ?? "");
  const recipeSlug = String(formData.get("recipeSlug") ?? "");
  const stepIndex = Number(formData.get("stepIndex"));
  if (!(file instanceof File) || file.size === 0 || !recipeId || !stepIndex) {
    return { error: "Missing photo, recipe, or step" };
  }
  if (!file.type.startsWith("image/"))
    return { error: "File must be an image" };
  if (file.size > 5 * 1024 * 1024) return { error: "Image must be under 5 MB" };

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${user.id}/${recipeId}/step-${stepIndex}-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("recipe-images")
    .upload(path, file, { contentType: file.type });
  if (uploadError) return { error: uploadError.message };
  const { data: pub } = supabase.storage
    .from("recipe-images")
    .getPublicUrl(path);
  const photoUrl = pub.publicUrl;

  type Step = { index?: number; photoUrl?: string } & Record<string, unknown>;
  const withPhoto = (steps: Step[]) =>
    steps.map((s) => (s.index === stepIndex ? { ...s, photoUrl } : s));

  // Try the recipe itself first (only succeeds for owner via RLS).
  const { data: recipe } = await supabase
    .from("recipes")
    .select("id, steps")
    .eq("id", recipeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (recipe) {
    const { error } = await supabase
      .from("recipes")
      .update({ steps: withPhoto((recipe.steps as Step[]) ?? []) })
      .eq("id", recipeId);
    if (error) return { error: error.message };
    return { ok: true, photoUrl };
  }

  // Catalogue recipe — store on the in-progress session snapshot.
  const { data: session } = await supabase
    .from("cooking_sessions")
    .select("id, recipe")
    .eq("user_id", user.id)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const snapshot = session?.recipe as { slug?: string; steps?: Step[] } | null;
  if (session && snapshot?.slug === recipeSlug && snapshot.steps) {
    const { error } = await supabase
      .from("cooking_sessions")
      .update({ recipe: { ...snapshot, steps: withPhoto(snapshot.steps) } })
      .eq("id", session.id);
    if (error) return { error: error.message };
  }

  return { ok: true, photoUrl };
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
