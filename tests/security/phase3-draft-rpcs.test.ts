import { createClient } from "@supabase/supabase-js";
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

/** Uses dedicated staging users and consumes six test quota units. */
(configured ? describe : describe.skip)("Phase 3 draft lifecycle RPCs", () => {
  it("creates once, charges once, and enforces owner-only acceptance and rejection", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
    const a = createClient(url, key, { auth: { persistSession: false } });
    const b = createClient(url, key, { auth: { persistSession: false } });
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
    const owner = signedA.data.user!.id;
    const before = await a
      .from("ai_usage_quota")
      .select("date,count")
      .eq("user_id", owner)
      .maybeSingle();
    expect(before.error).toBeNull();
    const startingCount =
      before.data?.date === new Date().toISOString().slice(0, 10)
        ? before.data.count
        : 0;
    const keyId = crypto.randomUUID();
    const input = {
      p_kind: "generated",
      p_request: { request: "A simple soup", maxMinutes: 30, servings: 1 },
      p_input_id: null,
      p_idempotency_key: keyId,
    };
    let draftId: string | null = null;
    try {
      const first = await a.rpc("create_recipe_draft", input);
      expect(first.error).toBeNull();
      expect(first.data.created).toBe(true);
      draftId = first.data.draft.id as string;
      const second = await a.rpc("create_recipe_draft", input);
      expect(second.error).toBeNull();
      expect(second.data).toMatchObject({
        created: false,
        draft: { id: draftId },
      });
      const other = await a.rpc("create_recipe_draft", {
        ...input,
        p_idempotency_key: crypto.randomUUID(),
      });
      expect(other.error).not.toBeNull();
      const after = await a
        .from("ai_usage_quota")
        .select("count")
        .eq("user_id", owner)
        .single();
      expect(after.data?.count).toBe(startingCount + 6);
      expect(
        (await b.from("recipe_drafts").select("id").eq("id", draftId)).data,
      ).toEqual([]);
      expect(
        (await b.rpc("accept_recipe_draft", { draft_id: draftId })).error,
      ).not.toBeNull();
      expect(
        (await a.rpc("accept_recipe_draft", { draft_id: draftId })).error,
      ).not.toBeNull();
      expect(
        (await b.rpc("reject_recipe_draft", { p_draft_id: draftId })).error,
      ).not.toBeNull();
      expect(
        (
          await a
            .from("recipe_drafts")
            .update({ status: "accepted" })
            .eq("id", draftId)
        ).error,
      ).not.toBeNull();
    } finally {
      if (draftId) {
        expect(
          (await a.rpc("reject_recipe_draft", { p_draft_id: draftId })).error,
        ).toBeNull();
        expect(
          (await a.rpc("reject_recipe_draft", { p_draft_id: draftId })).error,
        ).toBeNull();
      }
    }
  }, 30_000);
});
