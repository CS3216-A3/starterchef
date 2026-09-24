import { z } from "zod";
import { ownedSession, sessionIdFromPath } from "@/lib/cooking-session-api";
import { protectedError, withProtectedRoute } from "@/lib/protected-route";

const bodySchema = z.object({
  rating: z.number().int().min(1).max(5).nullable().optional(),
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
  const { error } = await context.supabase.rpc("save_cooking_feedback", {
    p_session_id: id,
    p_rating: parsed.data.rating ?? null,
    p_would_make_again: parsed.data.wouldMakeAgain,
    p_perceived_difficulty: parsed.data.perceivedDifficulty,
    p_notes: parsed.data.notes,
  });
  if (error)
    return protectedError(
      context,
      500,
      "INTERNAL_ERROR",
      "Could not save feedback",
    );
  return Response.json({ ok: true });
});
