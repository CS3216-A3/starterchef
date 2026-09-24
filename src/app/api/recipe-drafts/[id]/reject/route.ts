import { z } from "zod";
import { protectedError, withProtectedRoute } from "@/lib/protected-route";

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
    const { data, error } = await supabase.rpc("reject_recipe_draft", {
      p_draft_id: id,
    });
    if (error)
      return protectedError(
        { requestId },
        500,
        "INTERNAL_ERROR",
        "Could not reject recipe draft",
      );
    if (!data)
      return protectedError(
        { requestId },
        404,
        "NOT_FOUND",
        "Recipe draft not found or cannot be rejected",
      );
    return Response.json({ ok: true });
  },
);
