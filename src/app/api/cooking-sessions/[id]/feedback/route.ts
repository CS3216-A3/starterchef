import { z } from "zod";
import { ownedSession, sessionIdFromPath } from "@/lib/cooking-session-api";
import { protectedError, withProtectedRoute } from "@/lib/protected-route";

const bodySchema = z.object({
  wouldMakeAgain: z.boolean().nullable(),
  perceivedDifficulty: z.number().int().min(1).max(5).nullable(),
  notes: z.string().max(2000).default(""),
});
export const PUT = withProtectedRoute(async (context) => {
  const id = sessionIdFromPath(context.request, -2);
  const parsed = bodySchema.safeParse(
    await context.request.json().catch(() => null),
  );
  if (!parsed.success)
    return protectedError(context, 400, "INVALID_REQUEST", "Invalid feedback");
  const known = await ownedSession(context, id);
  if (known.error) return known.error;
  const { error } = await context.supabase
    .from("recipe_feedback")
    .upsert(
      {
        user_id: context.user.id,
        session_id: id,
        recipe_id: known.data.recipe_id,
        would_make_again: parsed.data.wouldMakeAgain,
        perceived_difficulty: parsed.data.perceivedDifficulty,
        notes: parsed.data.notes,
      },
      { onConflict: "user_id,session_id" },
    );
  if (error)
    return protectedError(
      context,
      500,
      "INTERNAL_ERROR",
      "Could not save feedback",
    );
  return Response.json({ ok: true });
});
