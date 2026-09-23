"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/slug";
import type { ImportedRecipe } from "@/lib/ai/schemas/import";
import { safeActionFailure } from "@/lib/action-result";
import {
  createRecipeSchema,
  updateRecipeSchema,
  uuidSchema,
} from "@/lib/validation/actions";
import {
  inspectKitchenImage,
  KITCHEN_IMAGE_MAX_BYTES,
} from "@/lib/image-upload";
import { privateMediaReference } from "@/lib/private-media";
import { recipeSafetyFailure } from "@/lib/validation/recipe-safety";

/** Save or unsave a catalogue recipe for the current user. */
export async function toggleSavedRecipe(recipeId: string, save: boolean) {
  const parsedId = uuidSchema.safeParse(recipeId);
  if (!parsedId.success || typeof save !== "boolean")
    return { error: "Invalid recipe" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  if (save) {
    const { error } = await supabase
      .from("saved_recipes")
      .upsert({ user_id: user.id, recipe_id: parsedId.data });
    if (error) return safeActionFailure("save this recipe", error);
  } else {
    const { error } = await supabase
      .from("saved_recipes")
      .delete()
      .eq("user_id", user.id)
      .eq("recipe_id", parsedId.data);
    if (error) return safeActionFailure("remove this saved recipe", error);
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
  const parsed = createRecipeSchema.safeParse(input);
  if (!parsed.success)
    return { error: "Check the recipe values and try again" };
  input = parsed.data;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("dietary_restrictions,allergies")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile)
    return { error: "Could not check recipe safety" };
  if (recipeSafetyFailure(input, profile))
    return {
      error:
        "This recipe conflicts with your dietary settings or contains an unsafe instruction",
    };

  const baseSlug = slugify(input.title);
  let slug = baseSlug;
  let suffix = 2;
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data: existing, error: lookupError } = await supabase
      .from("recipes")
      .select("slug")
      .eq("slug", slug)
      .maybeSingle();
    if (lookupError)
      return safeActionFailure("check the recipe name", lookupError);
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

  if (error) return safeActionFailure("create this recipe", error);

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
  const parsed = updateRecipeSchema.safeParse(input);
  if (!parsed.success)
    return { error: "Check the recipe values and try again" };
  input = parsed.data;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const [
    { data: existing, error: existingError },
    { data: profile, error: profileError },
  ] = await Promise.all([
    supabase
      .from("recipes")
      .select("ingredients,steps")
      .eq("id", input.id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("dietary_restrictions,allergies")
      .eq("id", user.id)
      .maybeSingle(),
  ]);
  if (existingError || !existing) return { error: "Recipe not found" };
  if (profileError || !profile)
    return { error: "Could not check recipe safety" };
  if (
    recipeSafetyFailure(
      {
        ingredients: input.ingredients ?? existing.ingredients,
        steps: input.steps ?? existing.steps,
      },
      profile,
    )
  )
    return {
      error:
        "This edit conflicts with your dietary settings or contains an unsafe instruction",
    };

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

  if (error) return safeActionFailure("update this recipe", error);

  revalidatePath("/recipes");
  revalidatePath("/today");
  return { ok: true };
}

/**
 * Upload a cover/step image privately and return an opaque reference plus a
 * short-lived preview URL. Only the opaque reference may be persisted.
 */
export async function uploadRecipeImage(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const file = formData.get("file");
  const recipeId = uuidSchema.safeParse(formData.get("recipeId"));
  if (!(file instanceof File) || file.size === 0) {
    return { error: "No file provided" };
  }
  if (!recipeId.success) return { error: "Invalid recipe" };
  if (file.size > KITCHEN_IMAGE_MAX_BYTES)
    return { error: "Image must be under 8 MiB" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const inspected = inspectKitchenImage(file.type, bytes);
  if (!inspected) return { error: "Choose a valid JPEG, PNG, or WebP image" };
  const path = `${user.id}/recipes/${recipeId.data}/${randomUUID()}.${inspected.extension}`;

  const { error } = await supabase.storage
    .from("recipe-inputs")
    .upload(path, bytes, { contentType: inspected.contentType, upsert: false });
  if (error) return safeActionFailure("upload this image", error);

  const { data, error: signError } = await supabase.storage
    .from("recipe-inputs")
    .createSignedUrl(path, 10 * 60);
  if (signError) return safeActionFailure("preview this image", signError);
  return { ok: true, path: privateMediaReference(path), url: data.signedUrl };
}

/** Delete a user-owned recipe. */
export async function deleteUserRecipe(recipeId: string) {
  const parsedId = uuidSchema.safeParse(recipeId);
  if (!parsedId.success) return { error: "Invalid recipe" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error } = await supabase
    .from("recipes")
    .delete()
    .eq("id", parsedId.data)
    .eq("user_id", user.id);

  if (error) return safeActionFailure("delete this recipe", error);

  revalidatePath("/recipes");
  revalidatePath("/today");
  return { ok: true };
}
