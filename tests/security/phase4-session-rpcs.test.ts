import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const configured =
  process.env.SECURITY_PHASE4_TESTS === "true" &&
  [
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.SECURITY_USER_A_EMAIL,
    process.env.SECURITY_USER_A_PASSWORD,
    process.env.SECURITY_USER_B_EMAIL,
    process.env.SECURITY_USER_B_PASSWORD,
  ].every(Boolean);

/** Opt in only against a disposable/staging project with 0028 and 0029.
 * This creates retained session/feedback history for dedicated test users. */
(configured ? describe : describe.skip)("Phase 4 owner-checked RPCs", () => {
  it("isolates users, versions every mutation, and completes one exact session", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
    const a: SupabaseClient = createClient(url, key, {
      auth: { persistSession: false },
    });
    const b: SupabaseClient = createClient(url, key, {
      auth: { persistSession: false },
    });
    const [signedA, signedB] = await Promise.all([
      a.auth.signInWithPassword({
        email: process.env.SECURITY_USER_A_EMAIL!,
        password: process.env.SECURITY_USER_A_PASSWORD!,
      }),
      b.auth.signInWithPassword({
        email: process.env.SECURITY_USER_B_EMAIL!,
        password: process.env.SECURITY_USER_B_PASSWORD!,
      }),
    ]);
    expect(signedA.error).toBeNull();
    expect(signedB.error).toBeNull();

    const { data: recipes, error: recipeError } = await a
      .from("recipes")
      .select("id")
      .is("user_id", null)
      .limit(1);
    expect(recipeError).toBeNull();
    expect(recipes?.length).toBe(1);
    const recipeId = recipes![0].id as string;
    const started = await a.rpc("start_cooking_session", {
      p_recipe_id: recipeId,
    });
    expect(started.error).toBeNull();
    const sessionId = started.data.id as string;
    const initialVersion = started.data.version as number;
    const resumed = await a.rpc("start_cooking_session", {
      p_recipe_id: recipeId,
    });
    expect(resumed.data.id).toBe(sessionId);

    const [hidden, bProgress, bEvent, bCheckpoint, bCredential] =
      await Promise.all([
        b.from("cooking_sessions").select("id").eq("id", sessionId),
        b.rpc("update_cooking_session_progress", {
          p_session_id: sessionId,
          p_step: 1,
          p_expected_version: initialVersion,
        }),
        b.rpc("append_cooking_event", {
          p_session_id: sessionId,
          p_step_index: 1,
          p_kind: "qa",
          p_payload: {},
          p_expires_at: null,
        }),
        b.rpc("record_cooking_checkpoint", {
          p_session_id: sessionId,
          p_step_index: 1,
          p_object_path: `${signedA.data.user!.id}/checkpoints/${sessionId}/${crypto.randomUUID()}.jpg`,
          p_verdict: {},
        }),
        b.rpc("claim_realtime_attempt", {
          p_session_id: sessionId,
          p_attempt_id: crypto.randomUUID(),
          p_fallback_from: null,
        }),
      ]);
    expect(hidden.data).toEqual([]);
    for (const denied of [bProgress, bEvent, bCheckpoint, bCredential])
      expect(denied.error).not.toBeNull();

    const direct = await a
      .from("cooking_sessions")
      .update({ current_step: 1 })
      .eq("id", sessionId);
    expect(direct.error).not.toBeNull();
    const progress = await a.rpc("update_cooking_session_progress", {
      p_session_id: sessionId,
      p_step: 1,
      p_expected_version: initialVersion,
    });
    expect(progress.error).toBeNull();
    expect(progress.data.session.version).toBe(initialVersion + 1);
    const staleProgress = await a.rpc("update_cooking_session_progress", {
      p_session_id: sessionId,
      p_step: 1,
      p_expected_version: initialVersion,
    });
    expect(staleProgress.data.conflict).toBe(true);

    const now = new Date();
    const timer = await a.rpc("update_cooking_session_timer", {
      p_session_id: sessionId,
      p_expected_version: initialVersion + 1,
      p_timer: {
        status: "running",
        stepIndex: 1,
        durationSeconds: 60,
        startedAt: now.toISOString(),
        endsAt: new Date(now.getTime() + 60_000).toISOString(),
      },
    });
    expect(timer.error).toBeNull();
    expect(timer.data.session.version).toBe(initialVersion + 2);
    const staleTimer = await a.rpc("update_cooking_session_timer", {
      p_session_id: sessionId,
      p_expected_version: initialVersion + 1,
      p_timer: { status: "idle" },
    });
    expect(staleTimer.data.conflict).toBe(true);
    const adjustment = await a.rpc("append_cooking_adjustment", {
      p_session_id: sessionId,
      p_expected_version: initialVersion + 2,
      p_adjustment: {
        stepIndex: 1,
        title: "Technique",
        detail: "Stir gently.",
        replacementInstruction: "Cook over low heat and stir gently.",
      },
    });
    expect(adjustment.error).toBeNull();
    expect(adjustment.data.session.version).toBe(initialVersion + 3);
    expect(adjustment.data.session.recipe.steps[0].instruction).toBe(
      "Cook over low heat and stir gently.",
    );
    const staleAdjustment = await a.rpc("append_cooking_adjustment", {
      p_session_id: sessionId,
      p_expected_version: initialVersion + 2,
      p_adjustment: {
        stepIndex: 1,
        title: "Technique",
        detail: "Stir gently.",
        replacementInstruction: "Cook over low heat and stir gently.",
      },
    });
    expect(staleAdjustment.data.conflict).toBe(true);

    const oversizedEvent = await a.rpc("append_cooking_event", {
      p_session_id: sessionId,
      p_step_index: 1,
      p_kind: "qa",
      p_payload: { text: "x".repeat(5000) },
      p_expires_at: null,
    });
    expect(oversizedEvent.error).not.toBeNull();
    const bEvents = await b
      .from("session_events")
      .select("id")
      .eq("session_id", sessionId);
    expect(bEvents.data).toEqual([]);
    const directEvent = await a.from("session_events").insert({
      session_id: sessionId,
      user_id: signedA.data.user!.id,
      kind: "qa",
      payload: {},
    });
    expect(directEvent.error).not.toBeNull();
    const directCheckpoint = await a.from("cooking_checkpoints").insert({
      session_id: sessionId,
      user_id: signedA.data.user!.id,
      step_index: 1,
      object_path: "not-an-image",
      verdict: {},
    });
    expect(directCheckpoint.error).not.toBeNull();
    const voiceAttemptId = crypto.randomUUID();
    const openaiAttempt = await a.rpc("claim_realtime_attempt", {
      p_session_id: sessionId,
      p_attempt_id: voiceAttemptId,
      p_fallback_from: null,
    });
    expect(openaiAttempt.error).toBeNull();
    expect(openaiAttempt.data).toBe("openai");
    const geminiFallback = await a.rpc("claim_realtime_attempt", {
      p_session_id: sessionId,
      p_attempt_id: voiceAttemptId,
      p_fallback_from: "openai",
    });
    expect(geminiFallback.error).toBeNull();
    expect(geminiFallback.data).toBe("gemini");
    const repeatedFallback = await a.rpc("claim_realtime_attempt", {
      p_session_id: sessionId,
      p_attempt_id: voiceAttemptId,
      p_fallback_from: "openai",
    });
    expect(repeatedFallback.error).not.toBeNull();
    const connectedAttemptId = crypto.randomUUID();
    expect(
      (
        await a.rpc("claim_realtime_attempt", {
          p_session_id: sessionId,
          p_attempt_id: connectedAttemptId,
          p_fallback_from: null,
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await a.rpc("mark_realtime_attempt_connected", {
          p_session_id: sessionId,
          p_attempt_id: connectedAttemptId,
        })
      ).data,
    ).toBe(true);
    expect(
      (
        await a.rpc("claim_realtime_attempt", {
          p_session_id: sessionId,
          p_attempt_id: connectedAttemptId,
          p_fallback_from: "openai",
        })
      ).error,
    ).not.toBeNull();
    const bComplete = await b.rpc("complete_cooking_session", {
      p_session_id: sessionId,
      p_expected_version: initialVersion + 3,
    });
    expect(bComplete.error).not.toBeNull();
    const completed = await a.rpc("complete_cooking_session", {
      p_session_id: sessionId,
      p_expected_version: initialVersion + 3,
    });
    expect(completed.error).toBeNull();
    expect(completed.data.session.status).toBe("completed");
    const repeated = await a.rpc("complete_cooking_session", {
      p_session_id: sessionId,
      p_expected_version: initialVersion,
    });
    expect(repeated.error).toBeNull();
    expect(repeated.data.session.version).toBe(completed.data.session.version);

    const feedback = await a.rpc("save_cooking_feedback", {
      p_session_id: sessionId,
      p_rating: 4,
      p_would_make_again: true,
      p_perceived_difficulty: 2,
      p_notes: "Staging test.",
    });
    expect(feedback.error).toBeNull();
    const bFeedback = await b.rpc("save_cooking_feedback", {
      p_session_id: sessionId,
      p_rating: 1,
      p_would_make_again: false,
      p_perceived_difficulty: 5,
      p_notes: "forged",
    });
    expect(bFeedback.error).not.toBeNull();
    const feedbackRows = await b
      .from("recipe_feedback")
      .select("id")
      .eq("session_id", sessionId);
    expect(feedbackRows.data).toEqual([]);
    const directFeedback = await a.from("recipe_feedback").insert({
      user_id: signedA.data.user!.id,
      session_id: sessionId,
      notes: "bypass",
    });
    expect(directFeedback.error).not.toBeNull();
  }, 30_000);
});
