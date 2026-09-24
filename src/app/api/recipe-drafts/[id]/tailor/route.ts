import { z } from "zod";
import { start } from "workflow/api";
import { protectedError, withProtectedRoute } from "@/lib/protected-route";
import { createAdminClient } from "@/lib/supabase/admin";
import { recipeVerificationWorkflow } from "../../../../../../workflows/recipe-verification";

const bodySchema = z.object({
  intent: z.string().trim().min(1).max(1000),
  idempotencyKey: z.uuid(),
});

/** Regenerate within the same owned review, then require a new final pass. */
export const POST = withProtectedRoute(
  async ({ request, supabase, requestId }) => {
    const id = new URL(request.url).pathname.split("/").at(-2) ?? "";
    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!z.uuid().safeParse(id).success || !body.success)
      return protectedError(
        { requestId },
        400,
        "INVALID_REQUEST",
        "Invalid tailoring request",
      );
    const { data, error } = await supabase.rpc("tailor_recipe_draft", {
      p_draft_id: id,
      p_intent: body.data.intent,
      p_idempotency_key: body.data.idempotencyKey,
    });
    if (error)
      return protectedError(
        { requestId },
        error.code === "P0002"
          ? 404
          : error.code === "P0001"
            ? 429
            : error.code === "22023"
              ? 409
              : 500,
        error.code === "P0002"
          ? "NOT_FOUND"
          : error.code === "P0001"
            ? "RATE_LIMITED"
            : error.code === "22023"
              ? "CONFLICT"
              : "INTERNAL_ERROR",
        error.code === "P0002"
          ? "Recipe review not found"
          : error.code === "P0001"
            ? "Daily AI credit limit reached"
            : error.code === "22023"
              ? "This recipe can no longer be tailored"
              : "Could not tailor recipe",
      );
    const outcome = data as {
      draft?: { workflow_attempt_id: string; status: string };
      created?: boolean;
    } | null;
    const attemptId = outcome?.draft?.workflow_attempt_id;
    if (!attemptId)
      return protectedError(
        { requestId },
        500,
        "INTERNAL_ERROR",
        "Could not load recipe review",
      );
    if (!outcome?.created)
      return Response.json({ draftId: id, status: outcome?.draft?.status });
    const admin = createAdminClient();
    try {
      const run = await start(recipeVerificationWorkflow, [id, attemptId]);
      await admin
        .from("recipe_drafts")
        .update({
          workflow_run_id: run.runId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("workflow_attempt_id", attemptId);
      return Response.json(
        { draftId: id, status: "queued", workflowRunId: run.runId },
        { status: 202 },
      );
    } catch {
      await admin
        .from("recipe_drafts")
        .update({
          status: "failed_retryable",
          failure_code: "WORKFLOW_START_FAILED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("workflow_attempt_id", attemptId);
      return protectedError(
        { requestId },
        503,
        "INTERNAL_ERROR",
        "Recipe tailoring could not be queued",
      );
    }
  },
);
