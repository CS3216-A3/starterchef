import { z } from "zod";
import {
  ownedSession,
  rpcError,
  sessionIdFromPath,
} from "@/lib/cooking-session-api";
import { protectedError, withProtectedRoute } from "@/lib/protected-route";

const bodySchema = z.object({
  expectedVersion: z.number().int().positive(),
  proposal: z.object({
    stepIndex: z.number().int().min(1),
    title: z.string().trim().min(1).max(120),
    detail: z.string().trim().min(1).max(1000),
    replacementInstruction: z.string().trim().min(1).max(1000),
  }),
});
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
      "Invalid adjustment proposal",
    );
  const known = await ownedSession(context, id);
  if (known.error) return known.error;
  const steps =
    (known.data.recipe as { steps?: unknown[] } | null)?.steps ?? [];
  if (parsed.data.proposal.stepIndex > steps.length)
    return protectedError(
      context,
      400,
      "INVALID_REQUEST",
      "Adjustment does not match this recipe",
    );
  const { data, error } = await context.supabase.rpc(
    "append_cooking_adjustment",
    {
      p_session_id: id,
      p_adjustment: parsed.data.proposal,
      p_expected_version: parsed.data.expectedVersion,
    },
  );
  if (error || !data) return rpcError(context, error);
  return Response.json(data, {
    status: (data as { conflict?: boolean }).conflict ? 409 : 200,
  });
});
