import { z } from "zod";
import { protectedError, withProtectedRoute } from "@/lib/protected-route";
import { isAllowedRecipeUrl } from "@/lib/recipe-source-allowlist";
import { createAdminClient } from "@/lib/supabase/admin";
import { start } from "workflow/api";
import { recipeVerificationWorkflow } from "../../../../workflows/recipe-verification";

/** Statuses that still hold the one-active-draft-per-user slot. */
const ACTIVE_DRAFT_STATUSES = [
  "queued",
  "acquiring_source",
  "extracting_or_generating",
  "verifying",
  "adjudicating",
  "awaiting_user_acceptance",
  "failed_retryable",
] as const;

const requestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("generated"),
    request: z.string().trim().min(1).max(4000),
    maxMinutes: z.number().int().min(1).max(480),
    servings: z.number().int().min(1).max(24),
    idempotencyKey: z.uuid(),
  }),
  z.object({
    kind: z.literal("photo"),
    inputId: z.uuid(),
    idempotencyKey: z.uuid(),
  }),
  z.object({
    kind: z.literal("text"),
    content: z.string().trim().min(1).max(20_000),
    idempotencyKey: z.uuid(),
  }),
  z.object({
    kind: z.literal("url"),
    url: z.url(),
    idempotencyKey: z.uuid(),
  }),
  z.object({
    kind: z.literal("adapted"),
    recipeId: z.uuid(),
    intent: z.string().trim().min(1).max(1000),
    idempotencyKey: z.uuid(),
  }),
  z.object({
    kind: z.literal("youtube"),
    url: z.url(),
    idempotencyKey: z.uuid(),
  }),
]);

export const POST = withProtectedRoute(async ({ request, requestId, user }) => {
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return protectedError(
      { requestId },
      400,
      "INVALID_REQUEST",
      "Invalid recipe draft request",
    );
  const input = parsed.data;
  if (
    (input.kind === "url" || input.kind === "youtube") &&
    !isAllowedRecipeUrl(input.url)
  ) {
    return protectedError(
      { requestId },
      403,
      "SOURCE_NOT_ALLOWED",
      "This recipe source is not approved yet",
    );
  }
  const admin = createAdminClient();
  let inputRow: { id: string; sha256: string } | null = null;
  if (input.kind === "photo") {
    const { data } = await admin
      .from("recipe_inputs")
      .select("id,sha256")
      .eq("id", input.inputId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!data)
      return protectedError(
        { requestId },
        404,
        "NOT_FOUND",
        "Recipe input not found",
      );
    inputRow = data;
  }
  if (input.kind === "adapted") {
    const { data } = await admin
      .from("recipes")
      .select("id")
      .eq("id", input.recipeId)
      .or(`user_id.is.null,user_id.eq.${user.id}`)
      .maybeSingle();
    if (!data)
      return protectedError(
        { requestId },
        404,
        "NOT_FOUND",
        "Recipe not found",
      );
  }
  // recipe_drafts_one_active_per_user allows a single non-terminal draft
  // per user. Reconcile it before inserting instead of surfacing a 23505.
  const { data: active } = await admin
    .from("recipe_drafts")
    .select("id,status,updated_at")
    .eq("user_id", user.id)
    .in("status", ACTIVE_DRAFT_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (active?.status === "awaiting_user_acceptance") {
    // There's a finished review waiting — hand it back so the user accepts
    // or rejects it before starting another.
    return Response.json(
      { draftId: active.id, status: active.status, resumedDraft: true },
      { status: 200 },
    );
  }

  const STALE_AFTER_MS = 15 * 60 * 1000;
  const stale =
    active &&
    Date.now() - new Date(active.updated_at).getTime() > STALE_AFTER_MS;

  if (active && !stale) {
    return protectedError(
      { requestId },
      409,
      "CONFLICT",
      "A recipe is already being processed — give it a moment and try again.",
    );
  }

  if (active && stale) {
    // Stuck in a working state or retryable failure — supersede it so the
    // new import isn't permanently blocked.
    await admin
      .from("recipe_drafts")
      .update({
        status: "failed_permanent",
        failure_code: "SUPERSEDED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", active.id);
  }

  const requestJson = requestForDraft(input);
  const { data: inserted, error } = await admin
    .from("recipe_drafts")
    .upsert(
      {
        user_id: user.id,
        kind: input.kind,
        request: requestJson,
        input_id: inputRow?.id ?? null,
        input_sha256: inputRow?.sha256 ?? null,
        idempotency_key: input.idempotencyKey,
        status: "queued",
      },
      { onConflict: "user_id,idempotency_key", ignoreDuplicates: true },
    )
    .select("id,status,accepted_recipe_id,verification");
  if (error) {
    if (error.code === "23505") {
      return protectedError(
        { requestId },
        409,
        "CONFLICT",
        "Finish or reject your current recipe review, then try again.",
      );
    }
    return protectedError(
      { requestId },
      500,
      "INTERNAL_ERROR",
      "Could not create recipe draft",
    );
  }
  const draft =
    inserted?.[0] ??
    (
      await admin
        .from("recipe_drafts")
        .select("id,status,accepted_recipe_id,verification")
        .eq("user_id", user.id)
        .eq("idempotency_key", input.idempotencyKey)
        .single()
    ).data;
  if (!draft)
    return protectedError(
      { requestId },
      500,
      "INTERNAL_ERROR",
      "Could not load recipe draft",
    );
  if (inputRow && inserted?.length)
    await admin
      .from("recipe_inputs")
      .update({ consuming_draft_id: draft.id })
      .eq("id", inputRow.id)
      .eq("user_id", user.id);
  let workflowRunId: string | null = null;
  if (inserted?.length) {
    try {
      // The only workflow argument is the opaque draft identifier. All private
      // source media, prompts, profile, pantry, and model output stay in DB
      // inside individual use-step functions.
      const run = await start(recipeVerificationWorkflow, [draft.id]);
      workflowRunId = run.runId;
      await admin
        .from("recipe_drafts")
        .update({
          workflow_run_id: workflowRunId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", draft.id);
    } catch {
      await admin
        .from("recipe_drafts")
        .update({
          status: "failed_retryable",
          failure_code: "WORKFLOW_START_FAILED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", draft.id);
      return protectedError(
        { requestId },
        503,
        "INTERNAL_ERROR",
        "Recipe verification could not be queued",
      );
    }
  }
  return Response.json(
    {
      draftId: draft.id,
      status: draft.status,
      workflowRunId,
      acceptedRecipeId: draft.accepted_recipe_id ?? null,
    },
    { status: inserted?.length ? 202 : 200 },
  );
});

function requestForDraft(input: z.infer<typeof requestSchema>) {
  switch (input.kind) {
    case "photo":
      return {};
    case "text":
      return { content: input.content };
    case "url":
    case "youtube":
      return { url: input.url };
    case "generated":
      return {
        request: input.request,
        maxMinutes: input.maxMinutes,
        servings: input.servings,
      };
    case "adapted":
      return { recipeId: input.recipeId, intent: input.intent };
  }
}
