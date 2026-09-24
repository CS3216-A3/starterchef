"use server";

import { z } from "zod";
import { measuredGenerate } from "@/lib/ai/instrument";
import { getModel } from "@/lib/ai/model";
import { renderPrompt } from "@/lib/ai/prompts";
import {
  sessionRecapSchema,
  type SessionRecap,
} from "@/lib/ai/schemas/cooking";
import { logSessionEvent } from "@/lib/session-events";
import { createClient } from "@/lib/supabase/server";
import type {
  RecipeStep,
  SessionEventRow,
  SessionRecipeSnapshot,
} from "@/lib/types";
import { safeActionFailure } from "@/lib/action-result";

const slugSchema = z.string().trim().min(1).max(200);
const stepEventSchema = z.object({
  sessionId: z.uuid(),
  stepIndex: z.number().int().min(1).max(500),
});

/**
 * Ensure there's an in-progress cooking_sessions row for this recipe.
 * If the user already has one for the same slug we keep it (so "Already
 * cooking" resumes); a session for a *different* recipe is left alone too —
 * the card on /today just points at whichever is newest.
 */
export async function startCookingSession(recipeSlug: string) {
  const parsedSlug = slugSchema.safeParse(recipeSlug);
  if (!parsedSlug.success) return { error: "Invalid recipe" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: recipe, error: recipeError } = await supabase
    .from("recipes")
    .select("id, slug, title, steps")
    .eq("slug", parsedSlug.data)
    .maybeSingle();
  if (recipeError) return safeActionFailure("load this recipe", recipeError);
  if (!recipe) return { error: "Recipe not found" };

  const { data: existing, error: existingError } = await supabase
    .from("cooking_sessions")
    .select("id, recipe")
    .eq("user_id", user.id)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError)
    return safeActionFailure("check active cooking sessions", existingError);

  const existingSlug = (existing?.recipe as { slug?: string } | null)?.slug;
  if (existing && existingSlug === parsedSlug.data) {
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

  if (error) return safeActionFailure("start cooking", error);

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
  const parsed = stepEventSchema.safeParse({ sessionId, stepIndex });
  if (!parsed.success) return;
  sessionId = parsed.data.sessionId;
  stepIndex = parsed.data.stepIndex;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: last, error: lastError } = await supabase
    .from("session_events")
    .select("kind, step_index")
    .eq("session_id", sessionId)
    .eq("kind", "step_entered")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) return;

  if (last?.kind === "step_entered" && last.step_index === stepIndex) return;

  const { error: updateError } = await supabase
    .from("cooking_sessions")
    .update({ current_step: stepIndex })
    .eq("id", sessionId)
    .eq("user_id", user.id);
  if (updateError) return;

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

  const { data: session, error: sessionError } = await supabase
    .from("cooking_sessions")
    .select("id, recipe")
    .eq("user_id", user.id)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sessionError)
    return safeActionFailure("load your cooking session", sessionError);

  const { error: completeError } = await supabase
    .from("cooking_sessions")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("status", "in_progress");
  if (completeError)
    return safeActionFailure("complete your cooking session", completeError);

  if (session) await generateSessionRecap(supabase, user.id, session.id);
  return { ok: true };
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

/**
 * Remove the checkpoint photo shown on a step. Clears it from the recipe
 * (when the user owns it) and from the in-progress session snapshot. The
 * session_events timeline is deliberately untouched — removal only affects
 * what is displayed on the step.
 */
export async function removeStepPhoto(input: {
  recipeSlug: string;
  stepIndex: number;
}) {
  const parsed = z
    .object({
      recipeSlug: slugSchema,
      stepIndex: z.number().int().min(1).max(500),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: recipe } = await supabase
    .from("recipes")
    .select("id, user_id, steps")
    .eq("slug", parsed.data.recipeSlug)
    .maybeSingle();
  if (!recipe) return { error: "Recipe not found" };

  const steps = ((recipe.steps as RecipeStep[] | null) ?? []).map((s) =>
    s.index === parsed.data.stepIndex ? { ...s, photoUrl: undefined } : s,
  );

  if (recipe.user_id === user.id) {
    const { error } = await supabase
      .from("recipes")
      .update({ steps })
      .eq("id", recipe.id);
    if (error) return safeActionFailure("remove the photo", error);
  }

  const { data: session } = await supabase
    .from("cooking_sessions")
    .select("id, recipe")
    .eq("user_id", user.id)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sessionRecipe = session?.recipe as SessionRecipeSnapshot | null;
  if (
    session &&
    sessionRecipe?.slug === parsed.data.recipeSlug &&
    sessionRecipe.steps
  ) {
    const snapshotSteps = (sessionRecipe.steps ?? []).map((s) =>
      s.index === parsed.data.stepIndex ? { ...s, photoUrl: undefined } : s,
    );
    await supabase
      .from("cooking_sessions")
      .update({ recipe: { ...sessionRecipe, steps: snapshotSteps } })
      .eq("id", session.id);
  }

  return { ok: true };
}
