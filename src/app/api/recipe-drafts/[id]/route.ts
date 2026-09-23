import { z } from "zod";
import { protectedError, withProtectedRoute } from "@/lib/protected-route";

export const GET = withProtectedRoute(
  async ({ request, supabase, requestId }) => {
    const id = new URL(request.url).pathname.split("/").at(-1) ?? "";
    if (!z.uuid().safeParse(id).success)
      return protectedError(
        { requestId },
        400,
        "INVALID_REQUEST",
        "Invalid draft ID",
      );
    const { data, error } = await supabase
      .from("recipe_drafts")
      .select(
        "id,status,failure_code,verification,accepted_recipe_id,expires_at,restart_count",
      )
      .eq("id", id)
      .maybeSingle();
    if (error)
      return protectedError(
        { requestId },
        500,
        "INTERNAL_ERROR",
        "Could not load recipe draft",
      );
    if (!data)
      return protectedError(
        { requestId },
        404,
        "NOT_FOUND",
        "Recipe draft not found",
      );
    return Response.json({
      draftId: data.id,
      status: data.status,
      failureCode: data.failure_code,
      review: data.verification,
      acceptedRecipeId: data.accepted_recipe_id,
      restartCount: data.restart_count,
      expiresAt: data.expires_at,
    });
  },
);
