"use server";

import { measuredGenerate } from "@/lib/ai/instrument";
import { getModel } from "@/lib/ai/model";
import { renderPrompt } from "@/lib/ai/prompts";
import {
  sessionRecapSchema,
  type SessionRecap,
} from "@/lib/ai/schemas/cooking";
import { logSessionEvent } from "@/lib/session-events";
import { createClient } from "@/lib/supabase/server";
import type { SessionEventRow } from "@/lib/types";

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
    .select("id, slug, title, steps")
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
      recipe_id: recipe.id,
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

  await logSessionEvent(supabase, {
    userId: user.id,
    sessionId: session.id,
    kind: "session_started",
    payload: { recipeTitle: recipe.title },
  });

  return { ok: true, sessionId: session.id };
}

/** Record that the user is viewing a step (fires once per step from the
 *  cook screen). Consecutive duplicates are skipped so re-mounts don't spam
 *  the timeline. */
export async function recordStepEvent(sessionId: string, stepIndex: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: last } = await supabase
    .from("session_events")
    .select("kind, step_index")
    .eq("session_id", sessionId)
    .eq("kind", "step_entered")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (last?.kind === "step_entered" && last.step_index === stepIndex) return;

  await supabase
    .from("cooking_sessions")
    .update({ current_step: stepIndex })
    .eq("id", sessionId)
    .eq("user_id", user.id);

  await logSessionEvent(supabase, {
    userId: user.id,
    sessionId,
    stepIndex,
    kind: "step_entered",
  });
}

/**
 * Mark the user's active session completed, then distill the event timeline
 * into an AI recap (summary + durable insights) stored on the session and
 * merged into recipe_feedback.learned for cross-session memory.
 */
export async function completeCookingSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: session } = await supabase
    .from("cooking_sessions")
    .select("id, recipe")
    .eq("user_id", user.id)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase
    .from("cooking_sessions")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("status", "in_progress");

  if (session) await generateSessionRecap(supabase, user.id, session.id);
}

/** Build the recap from the session timeline — best-effort, never throws. */
async function generateSessionRecap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  sessionId: string,
) {
  const { data: events } = await supabase
    .from("session_events")
    .select("step_index, kind, payload, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (!events || events.length === 0) return;

  const timeline = (events as SessionEventRow[])
    .map((e) => {
      const step = e.step_index ? ` [step ${e.step_index}]` : "";
      return `- ${e.kind}${step}: ${JSON.stringify(e.payload)}`;
    })
    .join("\n");

  try {
    const { object } = (await measuredGenerate("session-recap", {
      model: getModel(),
      schema: sessionRecapSchema,
      temperature: 0.3,
      system: renderPrompt("session-recap", {}),
      prompt: timeline,
    })) as { object: SessionRecap };

    await supabase
      .from("cooking_sessions")
      .update({ summary: object })
      .eq("id", sessionId);

    // Fold the durable insights into this session's feedback row so future
    // sessions can retrieve them via recipe_feedback.learned.
    const { data: feedback } = await supabase
      .from("recipe_feedback")
      .select("id, learned")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (feedback) {
      const prior = (feedback.learned as Record<string, unknown>) ?? {};
      await supabase
        .from("recipe_feedback")
        .update({
          learned: {
            ...prior,
            insights: object.insights,
            recap: object.summary,
          },
        })
        .eq("id", feedback.id);
    }
  } catch {
    // Recap generation is a nice-to-have — a failed model call must not
    // break finishing a session.
  }
}
