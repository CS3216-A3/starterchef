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
    const { data, error } = await supabase.rpc("accept_recipe_draft", {
      draft_id: id,
    });
    if (error)
      return protectedError(
        { requestId },
        error.code === "P0002" ? 404 : 409,
        error.code === "P0002" ? "NOT_FOUND" : "CONFLICT",
        error.code === "P0002"
          ? "Recipe draft not found"
          : "Recipe draft has not passed verification",
      );
    return Response.json({ recipeId: data });
  },
);
