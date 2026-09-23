import { z } from "zod";
import {
  ownedSession,
  rpcError,
  sessionIdFromPath,
} from "@/lib/cooking-session-api";
import { protectedError, withProtectedRoute } from "@/lib/protected-route";

const bodySchema = z.object({ expectedVersion: z.number().int().positive() });
export const POST = withProtectedRoute(async (context) => {
  const id = sessionIdFromPath(context.request, -2);
  const parsed = bodySchema.safeParse(
    await context.request.json().catch(() => null),
  );
  if (!parsed.success)
    return protectedError(
      context,
      400,
      "INVALID_REQUEST",
      "A valid session version is required",
    );
  const known = await ownedSession(context, id);
  if (known.error) return known.error;
  const { data, error } = await context.supabase.rpc(
    "complete_cooking_session",
    { p_session_id: id, p_expected_version: parsed.data.expectedVersion },
  );
  if (error || !data) return rpcError(context, error);
  return Response.json(data, {
    status: (data as { conflict?: boolean }).conflict ? 409 : 200,
  });
});
