import { z } from "zod";
import { importedRecipeSchema } from "@/lib/ai/schemas/import";
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
        "id,kind,status,failure_code,canonical_recipe,verification,accepted_recipe_id,expires_at,restart_count,tailoring_count,updated_at",
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
    // A draft recipe is deliberately not exposed while it is still being
    // generated or checked. Once it reaches review, however, it is the exact
    // server-owned recipe that the user is deciding whether to accept.
    const parsedRecipe = importedRecipeSchema.safeParse(
      normalizeLegacyCanonicalRecipe(data.canonical_recipe),
    );
    const recipe =
      (data.status === "awaiting_user_acceptance" ||
        data.status === "accepted") &&
      parsedRecipe.success
        ? parsedRecipe.data
        : null;
    // Keep reads compatible with projects where migration 0030 has not yet
    // been applied. The worker mirrors the deadline in existing verification
    // JSON; the database column remains authoritative for clarification RPCs.
    const review =
      data.verification && typeof data.verification === "object"
        ? (data.verification as Record<string, unknown>)
        : {};
    const clarificationExpiresAt =
      typeof review.clarificationExpiresAt === "string"
        ? review.clarificationExpiresAt
        : null;
    const clarificationExpired =
      data.status === "awaiting_user_input" &&
      clarificationExpiresAt &&
      new Date(clarificationExpiresAt).getTime() <= Date.now();
    return Response.json({
      draftId: data.id,
      kind: data.kind,
      status: clarificationExpired ? "blocked" : data.status,
      failureCode: clarificationExpired
        ? "PHOTO_CLARIFICATION_EXPIRED"
        : data.failure_code,
      review: data.verification,
      clarificationExpiresAt,
      acceptedRecipeId: data.accepted_recipe_id,
      recipe,
      restartCount: data.restart_count,
      tailorCount: data.tailoring_count ?? 0,
      expiresAt: data.expires_at,
      updatedAt: data.updated_at,
    });
  },
);

/** Recipes produced before strict OpenAI schemas used omitted optional fields.
 * Preserve those completed reviews by converting only those historical
 * omissions to the explicit nulls used by the current canonical schema. */
function normalizeLegacyCanonicalRecipe(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const recipe = value as Record<string, unknown>;
  return {
    ...recipe,
    description: recipe.description ?? null,
    tags: recipe.tags ?? null,
    whyGood: recipe.whyGood ?? null,
    steps: Array.isArray(recipe.steps)
      ? recipe.steps.map((step) => {
          if (!step || typeof step !== "object" || Array.isArray(step))
            return step;
          const current = step as Record<string, unknown>;
          return {
            ...current,
            durationSeconds: current.durationSeconds ?? null,
            tip: current.tip ?? null,
            photoCheckpoint: current.photoCheckpoint ?? null,
          };
        })
      : recipe.steps,
  };
}
