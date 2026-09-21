"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Save or unsave a recipe for the current user. */
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
