import { createClient } from "@/lib/supabase/server";
import { getDailyAiLimit } from "@/lib/rate-limit";
import {
  resolveRecipeMedia,
  resolveSessionRecipeMedia,
} from "@/lib/private-media";
import type {
  CookingSessionRow,
  KitchenItemRow,
  ProfileRow,
  RecipeRow,
} from "@/lib/types";

/**
 * Server-side query helpers. Every function uses the cookie-bound Supabase
 * client (src/lib/supabase/server.ts) so RLS applies. Missing auth is expected;
 * database failures throw instead of masquerading as empty application state.
 */

export class DataAccessError extends Error {
  constructor(operation: string, cause?: unknown) {
    super(`Data access failed: ${operation}`, { cause });
    this.name = "DataAccessError";
  }
}

function assertQuery(
  error: { code?: string; message?: string } | null,
  operation: string,
) {
  if (error) throw new DataAccessError(operation, error);
}

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
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  assertQuery(error, "load profile");
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
  const { data, error } = await supabase
    .from("ai_usage_quota")
    .select("count, date")
    .eq("user_id", user.id)
    .maybeSingle();
  assertQuery(error, "load AI usage");
  const today = new Date().toISOString().slice(0, 10);
  const used = data?.date === today ? (data.count ?? 0) : 0;
  return { used, limit };
}

export async function getKitchenItems(): Promise<KitchenItemRow[]> {
  const { supabase, user } = await getUserId();
  if (!user) return [];
  const { data, error } = await supabase
    .from("kitchen_items")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  assertQuery(error, "load pantry");
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
  const { data, error } = await query;
  assertQuery(error, "load recipes");
  return Promise.all(
    ((data as RecipeRow[] | null) ?? []).map((recipe) =>
      resolveRecipeMedia(supabase, recipe),
    ),
  );
}

export async function getRecipeBySlug(slug: string): Promise<RecipeRow | null> {
  const { supabase, user } = await getUserId();
  if (!user) return null;
  const { data, error } = await supabase
    .from("recipes")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  assertQuery(error, "load recipe by slug");
  if (data) return resolveRecipeMedia(supabase, data as RecipeRow);
  // User recipes may be linked by id instead of slug.
  return getRecipeById(slug);
}

export async function getRecipeById(id: string): Promise<RecipeRow | null> {
  const { supabase, user } = await getUserId();
  if (!user) return null;
  const { data, error } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  assertQuery(error, "load recipe by id");
  return data ? resolveRecipeMedia(supabase, data as RecipeRow) : null;
}

/** Recipes imported or personalised by the current user. */
export async function getUserRecipes(): Promise<RecipeRow[]> {
  const { supabase, user } = await getUserId();
  if (!user) return [];
  const { data, error } = await supabase
    .from("recipes")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  assertQuery(error, "load user recipes");
  return Promise.all(
    ((data as RecipeRow[] | null) ?? []).map((recipe) =>
      resolveRecipeMedia(supabase, recipe),
    ),
  );
}

/** Recipes the user has saved, joined through saved_recipes. */
export async function getSavedRecipes(): Promise<RecipeRow[]> {
  const { supabase, user } = await getUserId();
  if (!user) return [];
  const { data, error } = await supabase
    .from("saved_recipes")
    .select("recipe:recipes(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  assertQuery(error, "load saved recipes");
  const rows = (data ?? []) as unknown as { recipe: RecipeRow | null }[];
  return Promise.all(
    rows
      .flatMap((r) => (r.recipe ? [r.recipe] : []))
      .map((recipe) => resolveRecipeMedia(supabase, recipe)),
  );
}

export async function getSavedRecipeIds(): Promise<Set<string>> {
  const { supabase, user } = await getUserId();
  if (!user) return new Set();
  const { data, error } = await supabase
    .from("saved_recipes")
    .select("recipe_id")
    .eq("user_id", user.id);
  assertQuery(error, "load saved recipe ids");
  return new Set(
    ((data ?? []) as { recipe_id: string }[]).map((r) => r.recipe_id),
  );
}

export interface CookingHistoryEntry {
  id: string;
  status: CookingSessionRow["status"];
  current_step: number;
  summary: CookingSessionRow["summary"];
  started_at: string;
  completed_at: string | null;
  title: string | null;
  slug: string | null;
}

/** Recent cooking sessions (newest first) plus the all-time completed count,
 * for the profile page. Only the snapshot's title/slug are selected. */
export async function getCookingHistory(limit = 20): Promise<{
  sessions: CookingHistoryEntry[];
  completedCount: number;
}> {
  const { supabase, user } = await getUserId();
  if (!user) return { sessions: [], completedCount: 0 };
  const [history, completed] = await Promise.all([
    supabase
      .from("cooking_sessions")
      .select(
        "id, status, current_step, summary, started_at, completed_at, title:recipe->>title, slug:recipe->>slug",
      )
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(limit),
    supabase
      .from("cooking_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "completed"),
  ]);
  assertQuery(history.error, "load cooking history");
  assertQuery(completed.error, "count completed sessions");
  return {
    sessions: (history.data as CookingHistoryEntry[] | null) ?? [],
    completedCount: completed.count ?? 0,
  };
}

/** The user's most recent in-progress cooking session, if any. */
export async function getActiveCookingSession(): Promise<CookingSessionRow | null> {
  const { supabase, user } = await getUserId();
  if (!user) return null;
  const { data, error } = await supabase
    .from("cooking_sessions")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  assertQuery(error, "load active cooking session");
  if (!data) return null;
  const session = data as CookingSessionRow;
  return {
    ...session,
    recipe: await resolveSessionRecipeMedia(supabase, session.recipe),
  };
}
