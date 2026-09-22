import { createClient } from "@/lib/supabase/server";
import { getDailyAiLimit } from "@/lib/rate-limit";
import type {
  CookingSessionRow,
  KitchenItemRow,
  ProfileRow,
  RecipeRow,
} from "@/lib/types";

/**
 * Server-side query helpers. Every function uses the cookie-bound Supabase
 * client (src/lib/supabase/server.ts) so RLS applies; all return empty/null
 * when the caller isn't signed in.
 */

async function getUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function getUser() {
  const { user } = await getUserId();
  return user;
}

export async function getProfile(): Promise<ProfileRow | null> {
  const { supabase, user } = await getUserId();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return (data as ProfileRow | null) ?? null;
}

/** Today's AI usage for the signed-in user. The quota row only ever holds
 * the current UTC day's count — a stale date means the day rolled over. */
export async function getAiUsageToday(): Promise<{
  used: number;
  limit: number;
}> {
  const { supabase, user } = await getUserId();
  const limit = getDailyAiLimit();
  if (!user) return { used: 0, limit };
  const { data } = await supabase
    .from("ai_usage_quota")
    .select("count, date")
    .eq("user_id", user.id)
    .maybeSingle();
  const today = new Date().toISOString().slice(0, 10);
  const used = data?.date === today ? (data.count ?? 0) : 0;
  return { used, limit };
}

export async function getKitchenItems(): Promise<KitchenItemRow[]> {
  const { supabase, user } = await getUserId();
  if (!user) return [];
  const { data } = await supabase
    .from("kitchen_items")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  return (data as KitchenItemRow[] | null) ?? [];
}

export async function getRecipes(limit?: number): Promise<RecipeRow[]> {
  const { supabase, user } = await getUserId();
  if (!user) return [];
  let query = supabase
    .from("recipes")
    .select("*")
    .order("minutes", { ascending: true });
  if (limit) query = query.limit(limit);
  const { data } = await query;
  return (data as RecipeRow[] | null) ?? [];
}

export async function getRecipeBySlug(slug: string): Promise<RecipeRow | null> {
  const { supabase, user } = await getUserId();
  if (!user) return null;
  const { data } = await supabase
    .from("recipes")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (data) return data as RecipeRow;
  // User recipes may be linked by id instead of slug.
  return getRecipeById(slug);
}

export async function getRecipeById(id: string): Promise<RecipeRow | null> {
  const { supabase, user } = await getUserId();
  if (!user) return null;
  const { data } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as RecipeRow | null) ?? null;
}

/** Recipes imported or personalised by the current user. */
export async function getUserRecipes(): Promise<RecipeRow[]> {
  const { supabase, user } = await getUserId();
  if (!user) return [];
  const { data } = await supabase
    .from("recipes")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return (data as RecipeRow[] | null) ?? [];
}

/** Recipes the user has saved, joined through saved_recipes. */
export async function getSavedRecipes(): Promise<RecipeRow[]> {
  const { supabase, user } = await getUserId();
  if (!user) return [];
  const { data } = await supabase
    .from("saved_recipes")
    .select("recipe:recipes(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as { recipe: RecipeRow | null }[];
  return rows.flatMap((r) => (r.recipe ? [r.recipe] : []));
}

export async function getSavedRecipeIds(): Promise<Set<string>> {
  const { supabase, user } = await getUserId();
  if (!user) return new Set();
  const { data } = await supabase
    .from("saved_recipes")
    .select("recipe_id")
    .eq("user_id", user.id);
  return new Set(
    ((data ?? []) as { recipe_id: string }[]).map((r) => r.recipe_id),
  );
}

/** The user's most recent in-progress cooking session, if any. */
export async function getActiveCookingSession(): Promise<CookingSessionRow | null> {
  const { supabase, user } = await getUserId();
  if (!user) return null;
  const { data } = await supabase
    .from("cooking_sessions")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as CookingSessionRow | null) ?? null;
}
