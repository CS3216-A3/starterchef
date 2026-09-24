import { z } from "zod";
import { protectedError, withProtectedRoute } from "@/lib/protected-route";

const bodySchema = z.object({ recipeId: z.uuid() });

/** Start a server-owned snapshot, or resume the active snapshot for this recipe. */
export const POST = withProtectedRoute(
  async ({ request, supabase, requestId }) => {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return protectedError(
        { requestId },
        400,
        "INVALID_REQUEST",
        "A valid recipe ID is required",
      );
    const { data, error } = await supabase.rpc("start_cooking_session", {
      p_recipe_id: parsed.data.recipeId,
    });
    if (error || !data) {
      return protectedError(
        { requestId },
        error?.code === "P0002" ? 404 : 500,
        error?.code === "P0002" ? "NOT_FOUND" : "INTERNAL_ERROR",
        error?.code === "P0002"
          ? "Recipe not found"
          : "Could not start cooking session",
      );
    }
    return Response.json({ session: data });
  },
);
