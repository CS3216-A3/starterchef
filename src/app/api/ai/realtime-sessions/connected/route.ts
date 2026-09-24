import { z } from "zod";
import { protectedError, withProtectedRoute } from "@/lib/protected-route";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const admin = createAdminClient();
  const { data: attempt } = await admin
    .from("realtime_attempts")
    .select("provider")
    .eq("id", parsed.data.attemptId)
    .eq("session_id", parsed.data.sessionId)
    .eq("user_id", context.user.id)
    .maybeSingle();
  if (attempt)
    await admin.from("ai_calls").insert({
      user_id: context.user.id,
      name: "realtime-session",
      route: "/api/ai/realtime-sessions/connected",
      stage: "voice-connect",
      prompt_template_version: "phase5-v1",
      capability: "cooking-voice",
      modality: "audio",
      outcome: "connected",
      provider: attempt.provider,
      model: "live",
      session_id: parsed.data.sessionId,
      voice_attempt_id: parsed.data.attemptId,
    });
  return Response.json({ ok: true });
});
