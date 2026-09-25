import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const configured =
  process.env.SECURITY_PHASE4_TESTS === "true" &&
  [
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_SECRET_KEY,
    process.env.SECURITY_USER_A_EMAIL,
    process.env.SECURITY_USER_A_PASSWORD,
  ].every(Boolean);

(configured ? describe : describe.skip)("Phase 5 additive safety fixes", () => {
  it("rejects prolonged raw-chicken storage in the RPC and deletes ordinary recipes", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const user = createClient(
      url,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } },
    );
    const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, {
      auth: { persistSession: false },
    });
    const signed = await user.auth.signInWithPassword({
      email: process.env.SECURITY_USER_A_EMAIL!,
      password: process.env.SECURITY_USER_A_PASSWORD!,
    });
    expect(signed.error).toBeNull();
    const owner = signed.data.user!.id;
    const recipe = await user
      .from("recipes")
      .insert({
        user_id: owner,
        slug: `phase5-review-${randomUUID()}`,
        title: "Safety review soup",
        minutes: 5,
        servings: 1,
        ingredients: ["tomato"],
        equipment: ["pot"],
        steps: [{ index: 1, title: "Simmer", instruction: "Simmer safely." }],
      })
      .select("id")
      .single();
    expect(recipe.error).toBeNull();
    const recipeId = recipe.data!.id;
    try {
      const started = await user.rpc("start_cooking_session", {
        p_recipe_id: recipeId,
      });
      expect(started.error).toBeNull();
      const session = started.data as { id: string; version: number };
      const unsafe = await admin.rpc("apply_cooking_adjustment_service", {
        p_user_id: owner,
        p_session_id: session.id,
        p_adjustment: {
          stepIndex: 1,
          title: "Wait",
          detail: "Unsafe delay",
          replacementInstruction:
            "Leave raw chicken on the counter for three hours.",
        },
        p_expected_version: session.version,
      });
      expect(unsafe.error?.message).toContain("unsafe adjustment");
      const current = await user
        .from("cooking_sessions")
        .select("version")
        .eq("id", session.id)
        .single();
      expect(current.data?.version).toBe(session.version);
    } finally {
      const deleted = await user
        .from("recipes")
        .delete()
        .eq("id", recipeId)
        .select("id");
      expect(deleted.error).toBeNull();
      expect(deleted.data).toEqual([{ id: recipeId }]);
    }
  });
});
