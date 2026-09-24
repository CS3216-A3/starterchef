import { z } from "zod";
import { protectedError, withProtectedRoute } from "@/lib/protected-route";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z
  .object({
    sessionId: z.uuid(),
    attemptId: z.uuid(),
    reason: z.enum(["user", "expired", "connection_lost", "failed"]),
  })
  .strict();

export const POST = withProtectedRoute(async (context) => {
  const parsed = schema.safeParse(
    await context.request.json().catch(() => null),
  );
  if (!parsed.success)
    return protectedError(
      context,
      400,
      "INVALID_REQUEST",
      "Invalid voice close event",
    );
  const admin = createAdminClient();
  const { data: attempt, error } = await admin
    .from("realtime_attempts")
    .select("provider")
    .eq("id", parsed.data.attemptId)
    .eq("session_id", parsed.data.sessionId)
    .eq("user_id", context.user.id)
    .maybeSingle();
  if (error || !attempt)
    return protectedError(context, 404, "NOT_FOUND", "Voice attempt not found");
  const inserted = await admin.from("ai_calls").insert({
    user_id: context.user.id,
    name: "realtime-session",
    route: "/api/ai/realtime-sessions/closed",
    stage: "voice-close",
    prompt_template_version: "phase5-v1",
    capability: "cooking-voice",
    modality: "audio",
    outcome: "closed",
    error_code: parsed.data.reason,
    provider: attempt.provider,
    model: "live",
    session_id: parsed.data.sessionId,
    voice_attempt_id: parsed.data.attemptId,
  });
  if (inserted.error)
    return protectedError(
      context,
      500,
      "INTERNAL_ERROR",
      "Could not record voice close",
    );
  return Response.json({ ok: true });
});
