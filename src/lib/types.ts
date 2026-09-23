/**
 * Row types for the Supabase tables in supabase/migrations/.
 * Hand-maintained — regenerate from `supabase gen types` if that gets wired up.
 */

export interface ProfileRow {
  id: string;
  display_name: string | null;
  dietary_restrictions: string[];
  allergies: string[];
  taste_preferences: Record<string, unknown>;
  skill_level: "beginner" | "intermediate" | "advanced";
  household_size: number;
  onboarded_at: string | null;
}

export type KitchenItemKind = "ingredient" | "equipment";

export interface KitchenItemRow {
  id: string;
  user_id: string;
  kind: KitchenItemKind;
  name: string;
  quantity: string | null;
  expires_on: string | null;
  icon: string | null;
  source: "manual" | "scan";
  created_at: string;
}

/** A single step inside `recipes.steps` / `cooking_sessions.recipe.steps`. */
export interface RecipeStep {
  index: number;
  title: string;
  instruction: string;
  durationSeconds?: number;
  ingredients: string[];
  tip?: string;
  photoUrl?: string;
  photoCheckpoint?: string;
}

export type RecipeDifficulty = "easy" | "medium" | "hard";

export interface RecipeRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  minutes: number;
  difficulty: RecipeDifficulty;
  servings: number;
  why_good: string;
  icon: string;
  image_tint: string;
  image_url: string | null;
  /** Original opaque private reference; present only at authorized server boundaries. */
  image_reference?: string | null;
  ingredients: string[];
  equipment: string[];
  steps: RecipeStep[];
  tags: string[];
  source: string;
  source_url: string | null;
  user_id: string | null;
  parent_recipe_id: string | null;
  is_personalized: boolean;
  created_at: string;
}

export interface RecipeFeedbackRow {
  id: string;
  user_id: string;
  recipe_id: string;
  session_id: string | null;
  rating: number | null;
  substitutions_made: string[];
  equipment_adjusted: string[];
  scaled_servings: number | null;
  would_cook_again: boolean | null;
  notes: string;
  learned: Record<string, unknown>;
  created_at: string;
}

/** Shape of the jsonb snapshot stored in `cooking_sessions.recipe`. */
export interface SessionRecipeSnapshot {
  slug?: string;
  title?: string;
  steps?: RecipeStep[];
}

/** AI-generated recap stored on `cooking_sessions.summary` at finish time. */
export interface SessionSummary {
  summary: string;
  insights: string[];
  struggledSteps: number[];
}

export interface CookingSessionRow {
  id: string;
  user_id: string;
  recipe_id: string | null;
  recipe: SessionRecipeSnapshot;
  current_step: number;
  status: "in_progress" | "completed" | "abandoned";
  summary: SessionSummary | null;
  started_at: string;
  completed_at: string | null;
}

export type SessionEventKind =
  | "session_started"
  | "step_entered"
  | "qa"
  | "photo_check"
  | "photo_upload"
  | "feedback";

/** Payload shapes per event kind (stored in `session_events.payload`). */
export interface SessionEventPayload {
  question?: string;
  answer?: string;
  channel?: "text" | "voice";
  looksRight?: boolean | null;
  feedback?: string;
  tip?: string;
  photoUrl?: string;
  rating?: number;
  notes?: string;
  [key: string]: unknown;
}

export interface SessionEventRow {
  id: number;
  session_id: string;
  user_id: string;
  step_index: number | null;
  kind: SessionEventKind;
  payload: SessionEventPayload;
  created_at: string;
}
