import { z } from "zod";
import { protectedError, withProtectedRoute } from "@/lib/protected-route";

const schema = z.object({ sessionId: z.uuid(), attemptId: z.uuid() }).strict();

export const POST = withProtectedRoute(async (context) => {
  const parsed = schema.safeParse(
    await context.request.json().catch(() => null),
  );
  if (!parsed.success)
    return protectedError(
      context,
      400,
      "INVALID_REQUEST",
      "Invalid realtime attempt",
    );
  const { data, error } = await context.supabase.rpc(
    "mark_realtime_attempt_connected",
    {
      p_session_id: parsed.data.sessionId,
      p_attempt_id: parsed.data.attemptId,
    },
  );
  if (error || !data)
    return protectedError(
      context,
      404,
      "NOT_FOUND",
      "Realtime attempt not found",
    );
  return Response.json({ ok: true });
});
