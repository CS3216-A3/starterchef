import { createClient } from "@/lib/supabase/server";
import type {
  CookingSessionRow,
  SessionEventKind,
  SessionEventPayload,
  SessionEventRow,
} from "@/lib/types";
import {
  resolveEventMedia,
  resolveSessionRecipeMedia,
} from "@/lib/private-media";

/**
 * Session memory helpers. Every AI interaction during cooking appends to
 * `session_events` — the append-only timeline that powers the post-cook
 * recap and cross-session memory. Logging is best-effort: a failed insert
 * must never break the user-facing flow.
 */

type Db = Awaited<ReturnType<typeof createClient>>;

/** Append one event. RLS enforces that sessionId belongs to userId. */
export async function logSessionEvent(
  supabase: Db,
  input: {
    userId: string;
    sessionId?: string | null;
    stepIndex?: number | null;
    kind: SessionEventKind;
    payload?: SessionEventPayload;
  },
) {
  if (!input.sessionId) return;
  await supabase
    .from("session_events")
    .insert({
      session_id: input.sessionId,
      user_id: input.userId,
      step_index: input.stepIndex ?? null,
      kind: input.kind,
      payload: input.payload ?? {},
    })
    .then(({ error }) => {
      if (error) console.warn("session_events insert failed:", error.message);
    });
}

/** The user's active in-progress session, if any. */
export async function getActiveSession(supabase: Db, userId: string) {
  const { data } = await supabase
    .from("cooking_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null) ?? null;
}

/** Full event timeline for one session (recap + review page). */
export async function getSessionEvents(
  sessionId: string,
): Promise<SessionEventRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("session_events")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  return Promise.all(
    ((data as SessionEventRow[] | null) ?? []).map((event) =>
      resolveEventMedia(supabase, event),
    ),
  );
}

export async function getSessionById(
  sessionId: string,
): Promise<CookingSessionRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cooking_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (!data) return null;
  const session = data as CookingSessionRow;
  return {
    ...session,
    recipe: await resolveSessionRecipeMedia(supabase, session.recipe),
  };
}

/** Past sessions for a recipe — powers "Your cooking history". */
export async function getSessionsForRecipe(
  recipeId: string,
  slug: string,
): Promise<CookingSessionRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cooking_sessions")
    .select("*")
    .or(`recipe_id.eq.${recipeId},recipe->>slug.eq.${slug}`)
    .order("started_at", { ascending: false })
    .limit(10);
  return Promise.all(
    ((data as CookingSessionRow[] | null) ?? []).map(async (session) => ({
      ...session,
      recipe: await resolveSessionRecipeMedia(supabase, session.recipe),
    })),
  );
}

/**
 * Cross-session memory for the assistant: short factual lines distilled
 * from recent events + feedback so the agent remembers how this person
 * cooks ("last time the garlic burned", "they substituted oat milk").
 * Capped to keep prompts cheap.
 */
export async function getCookingMemory(
  supabase: Db,
  userId: string,
  limit = 10,
): Promise<string[]> {
  const facts: string[] = [];

  const { data: events } = await supabase
    .from("session_events")
    .select("kind, payload, created_at")
    .eq("user_id", userId)
    .in("kind", ["qa", "photo_check", "feedback"])
    .order("created_at", { ascending: false })
    .limit(30);

  for (const e of (events ?? []) as {
    kind: string;
    payload: SessionEventPayload;
  }[]) {
    if (e.kind === "photo_check" && e.payload.looksRight === false) {
      facts.push(
        `A progress photo needed a fix: ${e.payload.feedback ?? "unspecified issue"}`,
      );
    } else if (e.kind === "feedback" && e.payload.notes) {
      facts.push(`Their own note after cooking: "${e.payload.notes}"`);
    }
  }

  const { data: feedback } = await supabase
    .from("recipe_feedback")
    .select("substitutions_made, equipment_adjusted, notes")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  for (const f of (feedback ?? []) as {
    substitutions_made: string[];
    equipment_adjusted: string[];
    notes: string;
  }[]) {
    for (const s of f.substitutions_made ?? []) {
      facts.push(`They have substituted: ${s}`);
    }
    for (const s of f.equipment_adjusted ?? []) {
      facts.push(`Equipment work-around used: ${s}`);
    }
  }

  return [...new Set(facts)].slice(0, limit);
}
