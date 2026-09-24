import { z } from "zod";
import {
  ownedSession,
  rpcError,
  sessionIdFromPath,
} from "@/lib/cooking-session-api";
import { protectedError, withProtectedRoute } from "@/lib/protected-route";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookingAdjustmentFailure } from "@/lib/validation/recipe-safety";

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
  if (known.data.status !== "in_progress")
    return protectedError(
      context,
      409,
      "CONFLICT",
      "Cooking session is no longer active",
    );
  const steps =
    (known.data.recipe as { steps?: unknown[] } | null)?.steps ?? [];
  if (
    parsed.data.proposal.stepIndex !== known.data.current_step ||
    parsed.data.proposal.stepIndex > steps.length
  )
    return protectedError(
      context,
      400,
      "INVALID_REQUEST",
      "Adjustment does not match this recipe",
    );
  const { data: profile, error: profileError } = await context.supabase
    .from("profiles")
    .select("dietary_restrictions,allergies")
    .eq("id", context.user.id)
    .maybeSingle();
  if (profileError || !profile)
    return protectedError(
      context,
      500,
      "INTERNAL_ERROR",
      "Could not check food safety",
    );
  if (
    cookingAdjustmentFailure(
      parsed.data.proposal.replacementInstruction,
      profile,
    )
  )
    return protectedError(
      context,
      400,
      "INVALID_REQUEST",
      "This adjustment may be unsafe for your dietary profile",
    );
  const { data, error } = await createAdminClient().rpc(
    "apply_cooking_adjustment_service",
    {
      p_user_id: context.user.id,
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
