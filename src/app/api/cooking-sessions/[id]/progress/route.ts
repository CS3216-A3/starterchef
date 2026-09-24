import { z } from "zod";
import {
  ownedSession,
  rpcError,
  sessionIdFromPath,
} from "@/lib/cooking-session-api";
import { protectedError, withProtectedRoute } from "@/lib/protected-route";

const bodySchema = z.object({
  currentStep: z.number().int().min(1),
  expectedVersion: z.number().int().positive(),
});
export const PATCH = withProtectedRoute(async (context) => {
  const id = sessionIdFromPath(context.request, -2);
  const parsed = bodySchema.safeParse(
    await context.request.json().catch(() => null),
  );
  if (!parsed.success)
    return protectedError(
      context,
      400,
      "INVALID_REQUEST",
      "A valid step and session version are required",
    );
  const known = await ownedSession(context, id);
  if (known.error) return known.error;
  const { data, error } = await context.supabase.rpc(
    "update_cooking_session_progress",
    {
      p_session_id: id,
      p_step: parsed.data.currentStep,
      p_expected_version: parsed.data.expectedVersion,
    },
  );
  if (error || !data) return rpcError(context, error);
  return Response.json(data, {
    status: (data as { conflict?: boolean }).conflict ? 409 : 200,
  });
});
