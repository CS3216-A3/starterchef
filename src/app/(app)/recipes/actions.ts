"use server";

import { revalidatePath } from "next/cache";
import { getActiveSession, logSessionEvent } from "@/lib/session-events";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/slug";
import type { ImportedRecipe } from "@/lib/ai/schemas/import";

/** Save or unsave a catalogue recipe for the current user. */
export async function toggleSavedRecipe(recipeId: string, save: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  if (save) {
    const { error } = await supabase
      .from("saved_recipes")
      .upsert({ user_id: user.id, recipe_id: recipeId });
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("saved_recipes")
      .delete()
      .eq("user_id", user.id)
      .eq("recipe_id", recipeId);
    if (error) return { error: error.message };
  }

  revalidatePath("/recipes");
  return { ok: true };
}

export interface CreateRecipeInput extends ImportedRecipe {
  source: string;
  sourceUrl?: string;
  parentRecipeId?: string;
  imageUrl?: string;
}

/** Persist an imported or personalised recipe for the current user. */
export async function createUserRecipe(input: CreateRecipeInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const baseSlug = slugify(input.title);
  let slug = baseSlug;
  let suffix = 2;
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data: existing } = await supabase
      .from("recipes")
      .select("slug")
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${suffix}`;
    suffix++;
  }

  const row = {
    slug,
    title: input.title,
    description: input.description ?? "",
    minutes: input.minutes,
    difficulty: input.difficulty,
    servings: input.servings,
    why_good: input.whyGood ?? "",
    icon: "cooking-pot",
    image_tint: "from-oat to-oat-dark",
    ingredients: input.ingredients,
    equipment: input.equipment,
    steps: input.steps.map((s) => ({
      index: s.index,
      title: s.title,
      instruction: s.instruction,
      durationSeconds: s.durationSeconds,
      ingredients: s.ingredientsUsed,
      tip: s.tip,
      photoCheckpoint: s.photoCheckpoint,
    })),
    tags: input.tags,
    source: input.source,
    source_url: input.sourceUrl ?? null,
    image_url: input.imageUrl ?? null,
    user_id: user.id,
    parent_recipe_id: input.parentRecipeId ?? null,
    is_personalized: Boolean(input.parentRecipeId),
  };

  const { data, error } = await supabase
    .from("recipes")
    .insert(row)
    .select("id, slug")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/recipes");
  revalidatePath("/today");
  return { ok: true, id: data.id as string, slug: data.slug as string };
}

export interface UpdateRecipeInput {
  id: string;
  title?: string;
  description?: string;
  minutes?: number;
  difficulty?: "easy" | "medium" | "hard";
  servings?: number;
  ingredients?: string[];
  equipment?: string[];
  steps?: {
    index: number;
    title: string;
    instruction: string;
    durationSeconds?: number;
    ingredientsUsed: string[];
    tip?: string;
    photoCheckpoint?: string;
  }[];
  tags?: string[];
  imageUrl?: string;
}

/** Update a user-owned recipe. */
export async function updateUserRecipe(input: UpdateRecipeInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const update: Record<string, unknown> = {};
  if (input.title !== undefined) update.title = input.title;
  if (input.description !== undefined) update.description = input.description;
  if (input.minutes !== undefined) update.minutes = input.minutes;
  if (input.difficulty !== undefined) update.difficulty = input.difficulty;
  if (input.servings !== undefined) update.servings = input.servings;
  if (input.ingredients !== undefined) update.ingredients = input.ingredients;
  if (input.equipment !== undefined) update.equipment = input.equipment;
  if (input.steps !== undefined)
    update.steps = input.steps.map((s) => ({
      index: s.index,
      title: s.title,
      instruction: s.instruction,
      durationSeconds: s.durationSeconds,
      ingredients: s.ingredientsUsed,
      tip: s.tip,
      photoCheckpoint: s.photoCheckpoint,
    }));
  if (input.tags !== undefined) update.tags = input.tags;
  if (input.imageUrl !== undefined) update.image_url = input.imageUrl;

  const { error } = await supabase
    .from("recipes")
    .update(update)
    .eq("id", input.id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/recipes");
  revalidatePath("/today");
  revalidatePath(`/cook/${input.id}`);
  return { ok: true };
}

export interface RecipeFeedbackInput {
  recipeId: string;
  rating?: number;
  substitutionsMade: string[];
  equipmentAdjusted: string[];
  scaledServings?: number;
  wouldCookAgain?: boolean;
  notes: string;
}

/** Save feedback after cooking and optionally create a personalised version. */
export async function saveRecipeFeedback(
  input: RecipeFeedbackInput,
  options?: { createPersonalizedCopy?: ImportedRecipe },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  // Attach the active cooking session so the recap can fold insights back
  // into this row's `learned` jsonb.
  const session = await getActiveSession(supabase, user.id);

  const { error: feedbackError } = await supabase
    .from("recipe_feedback")
    .insert({
      user_id: user.id,
      recipe_id: input.recipeId,
      session_id: session?.id ?? null,
      rating: input.rating,
      substitutions_made: input.substitutionsMade,
      equipment_adjusted: input.equipmentAdjusted,
      scaled_servings: input.scaledServings,
      would_cook_again: input.wouldCookAgain,
      notes: input.notes,
    });

  if (feedbackError) return { error: feedbackError.message };

  await logSessionEvent(supabase, {
    userId: user.id,
    sessionId: session?.id,
    kind: "feedback",
    payload: {
      rating: input.rating,
      wouldCookAgain: input.wouldCookAgain,
      notes: input.notes || undefined,
      substitutionsMade: input.substitutionsMade,
    },
  });

  if (options?.createPersonalizedCopy) {
    const personalized = {
      ...options.createPersonalizedCopy,
      source: "personalized",
    };
    const result = await createUserRecipe({
      ...personalized,
      parentRecipeId: input.recipeId,
    });
    if (result.error) return result;
    return {
      ok: true,
      personalizedRecipeId: result.id,
      personalizedSlug: result.slug,
    };
  }

  revalidatePath("/recipes");
  return { ok: true };
}

/**
 * Upload a cover/step image to the `recipe-images` bucket under the user's
 * own folder and return its public URL.
 */
export async function uploadRecipeImage(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const file = formData.get("file");
  const recipeId = String(formData.get("recipeId") ?? "misc");
  const name = String(formData.get("name") ?? "image");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "No file provided" };
  }
  if (!file.type.startsWith("image/")) {
    return { error: "File must be an image" };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { error: "Image must be under 5 MB" };
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${user.id}/${recipeId}/${name}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("recipe-images")
    .upload(path, file, { contentType: file.type });
  if (error) return { error: error.message };

  const { data } = supabase.storage.from("recipe-images").getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}

/** Delete a user-owned recipe. */
export async function deleteUserRecipe(recipeId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error } = await supabase
    .from("recipes")
    .delete()
    .eq("id", recipeId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/recipes");
  revalidatePath("/today");
  return { ok: true };
}
