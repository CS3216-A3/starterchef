import { start } from "workflow/api";
import { z } from "zod";
import { protectedError, withProtectedRoute } from "@/lib/protected-route";
import { createAdminClient } from "@/lib/supabase/admin";
import { recipeVerificationWorkflow } from "../../../../../../workflows/recipe-verification";

const clarificationSchema = z.object({
  answer: z.string().trim().min(1).max(2000),
});

export const POST = withProtectedRoute(
  async ({ request, supabase, requestId }) => {
    const id = new URL(request.url).pathname.split("/").at(-2) ?? "";
    const body = clarificationSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!z.uuid().safeParse(id).success || !body.success)
      return protectedError(
        { requestId },
        400,
        "INVALID_REQUEST",
        "Provide a valid draft and clarification",
      );
    const { data, error } = await supabase.rpc("clarify_recipe_draft", {
      p_draft_id: id,
      p_answer: body.data.answer,
    });
    if (error)
      return protectedError(
        { requestId },
        error.code === "P0002" ? 404 : error.code === "22023" ? 409 : 500,
        error.code === "P0002"
          ? "NOT_FOUND"
          : error.code === "22023"
            ? "CONFLICT"
            : "INTERNAL_ERROR",
        error.code === "P0002"
          ? "Recipe draft not found"
          : error.code === "22023"
            ? "This clarification is no longer available"
            : "Could not resume recipe review",
      );
    const outcome = data as { draftId: string; attemptId: string } | null;
    if (!outcome?.attemptId)
      return protectedError(
        { requestId },
        500,
        "INTERNAL_ERROR",
        "Could not resume recipe review",
      );
    const admin = createAdminClient();
    try {
      const run = await start(recipeVerificationWorkflow, [
        id,
        outcome.attemptId,
      ]);
      await admin
        .from("recipe_drafts")
        .update({
          workflow_run_id: run.runId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("workflow_attempt_id", outcome.attemptId);
      return Response.json({ draftId: id, status: "queued" }, { status: 202 });
    } catch {
      await admin
        .from("recipe_drafts")
        .update({
          status: "failed_retryable",
          failure_code: "WORKFLOW_START_FAILED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("workflow_attempt_id", outcome.attemptId);
      return protectedError(
        { requestId },
        503,
        "INTERNAL_ERROR",
        "Recipe review could not be resumed; use Retry review",
      );
    }
  },
);
