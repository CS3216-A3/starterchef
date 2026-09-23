import { z } from "zod";
import {
  ownedSession,
  rpcError,
  sessionIdFromPath,
} from "@/lib/cooking-session-api";
import { protectedError, withProtectedRoute } from "@/lib/protected-route";

const timerSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("idle") }).strict(),
  z
    .object({
      status: z.literal("running"),
      stepIndex: z.number().int().positive(),
      durationSeconds: z.number().int().min(1).max(86400),
      startedAt: z.iso.datetime(),
      endsAt: z.iso.datetime(),
    })
    .strict(),
  z
    .object({
      status: z.literal("paused"),
      stepIndex: z.number().int().positive(),
      durationSeconds: z.number().int().min(1).max(86400),
      pausedRemainingSeconds: z.number().int().min(0).max(86400),
    })
    .strict(),
]);
const bodySchema = z
  .object({ timer: timerSchema, expectedVersion: z.number().int().positive() })
  .strict();

export const PUT = withProtectedRoute(async (context) => {
  const id = sessionIdFromPath(context.request, -2);
  const parsed = bodySchema.safeParse(
    await context.request.json().catch(() => null),
  );
  if (!parsed.success)
    return protectedError(
      context,
      400,
      "INVALID_REQUEST",
      "Invalid timer state",
    );
  const known = await ownedSession(context, id);
  if (known.error) return known.error;
  const { data, error } = await context.supabase.rpc(
    "update_cooking_session_timer",
    {
      p_session_id: id,
      p_timer: parsed.data.timer,
      p_expected_version: parsed.data.expectedVersion,
    },
  );
  if (error || !data) return rpcError(context, error);
  return Response.json(data, {
    status: (data as { conflict?: boolean }).conflict ? 409 : 200,
  });
});
