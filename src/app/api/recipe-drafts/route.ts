import { z } from "zod";
import { protectedError, withProtectedRoute } from "@/lib/protected-route";
import {
  isAllowedRecipeUrl,
  isAllowedYouTubeUrl,
} from "@/lib/recipe-source-allowlist";
import { assertPublicRecipeUrl } from "@/lib/recipe-web-source";
import { createAdminClient } from "@/lib/supabase/admin";
import { start } from "workflow/api";
import { recipeVerificationWorkflow } from "../../../../workflows/recipe-verification";

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

export const POST = withProtectedRoute(
  async ({ request, requestId, user, supabase }) => {
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
      !(input.kind === "youtube"
        ? isAllowedYouTubeUrl(input.url)
        : isAllowedRecipeUrl(input.url))
    ) {
      return protectedError(
        { requestId },
        403,
        "SOURCE_NOT_ALLOWED",
        input.kind === "youtube"
          ? "A YouTube import needs a YouTube URL"
          : "This recipe source must use public HTTP or HTTPS",
      );
    }
    if (input.kind === "url") {
      try {
        await assertPublicRecipeUrl(input.url);
      } catch {
        return protectedError(
          { requestId },
          403,
          "SOURCE_NOT_ALLOWED",
          "Recipe source must resolve to a public HTTP or HTTPS address",
        );
      }
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
    const requestJson = requestForDraft(input);
    const { data: result, error } = await supabase.rpc("create_recipe_draft", {
      p_kind: input.kind,
      p_request: requestJson,
      p_input_id: inputRow?.id ?? null,
      p_idempotency_key: input.idempotencyKey,
    });
    if (error)
      return protectedError(
        { requestId },
        error.code === "P0001" ? 429 : error.code === "23505" ? 409 : 500,
        error.code === "P0001"
          ? "RATE_LIMITED"
          : error.code === "23505"
            ? "CONFLICT"
            : "INTERNAL_ERROR",
        error.code === "P0001"
          ? "Daily AI credit limit reached"
          : error.code === "23505"
            ? "Finish or reject your active recipe draft first"
            : "Could not create recipe draft",
      );
    const outcome = result as {
      draft?: {
        id: string;
        status: string;
        accepted_recipe_id?: string | null;
        workflow_attempt_id: string;
      };
      created?: boolean;
    } | null;
    const draft = outcome?.draft;
    if (!draft)
      return protectedError(
        { requestId },
        500,
        "INTERNAL_ERROR",
        "Could not load recipe draft",
      );
    let workflowRunId: string | null = null;
    if (outcome?.created) {
      try {
        // The only workflow argument is the opaque draft identifier. All private
        // source media, prompts, profile, pantry, and model output stay in DB
        // inside individual use-step functions.
        const run = await start(recipeVerificationWorkflow, [
          draft.id,
          draft.workflow_attempt_id,
        ]);
        workflowRunId = run.runId;
        await admin
          .from("recipe_drafts")
          .update({
            workflow_run_id: workflowRunId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", draft.id)
          .eq("workflow_attempt_id", draft.workflow_attempt_id);
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
      { status: outcome?.created ? 202 : 200 },
    );
  },
);

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
