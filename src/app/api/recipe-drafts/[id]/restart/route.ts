import { z } from "zod";
import { randomUUID } from "node:crypto";
import { start } from "workflow/api";
import { protectedError, withProtectedRoute } from "@/lib/protected-route";
import { createAdminClient } from "@/lib/supabase/admin";
import { recipeVerificationWorkflow } from "../../../../../../workflows/recipe-verification";

/** Restarts only a transiently failed review. The conditional update keeps the
 * two user-initiated retries durable even if requests race. */
export const POST = withProtectedRoute(
  async ({ request, supabase, requestId }) => {
    const id = new URL(request.url).pathname.split("/").at(-2) ?? "";
    if (!z.uuid().safeParse(id).success)
      return protectedError(
        { requestId },
        400,
        "INVALID_REQUEST",
        "Invalid draft ID",
      );
    const { data: owned, error: loadError } = await supabase
      .from("recipe_drafts")
      .select("id,status,restart_count")
      .eq("id", id)
      .maybeSingle();
    if (loadError)
      return protectedError(
        { requestId },
        500,
        "INTERNAL_ERROR",
        "Could not load recipe draft",
      );
    if (!owned)
      return protectedError(
        { requestId },
        404,
        "NOT_FOUND",
        "Recipe draft not found",
      );
    if (owned.status !== "failed_retryable" || owned.restart_count >= 2)
      return protectedError(
        { requestId },
        409,
        "CONFLICT",
        "This recipe review cannot be restarted",
      );

    const admin = createAdminClient();
    const attemptId = randomUUID();
    const { data: restarted, error } = await admin
      .from("recipe_drafts")
      .update({
        status: "queued",
        failure_code: null,
        restart_count: owned.restart_count + 1,
        workflow_attempt_id: attemptId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "failed_retryable")
      .eq("restart_count", owned.restart_count)
      .select("id,restart_count")
      .maybeSingle();
    if (error)
      return protectedError(
        { requestId },
        error.code === "23505" ? 409 : 500,
        error.code === "23505" ? "CONFLICT" : "INTERNAL_ERROR",
        error.code === "23505"
          ? "Finish or reject your active recipe draft before restarting this one"
          : "Could not restart recipe review",
      );
    if (!restarted)
      return protectedError(
        { requestId },
        409,
        "CONFLICT",
        "This recipe review changed; refresh and try again",
      );
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
        {
          draftId: id,
          restartCount: restarted.restart_count,
          workflowRunId: run.runId,
        },
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
        "Recipe review could not be restarted",
      );
    }
  },
);
