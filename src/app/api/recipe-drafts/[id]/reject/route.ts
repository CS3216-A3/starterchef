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
    const { data, error } = await supabase
      .from("recipe_drafts")
      .update({
        status: "rejected",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "awaiting_user_acceptance")
      .select("id")
      .maybeSingle();
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
