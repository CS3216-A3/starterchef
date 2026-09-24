import "server-only";
import { z } from "zod";
import {
  protectedError,
  type ProtectedRouteContext,
} from "@/lib/protected-route";

export const sessionIdSchema = z.uuid();

export function sessionIdFromPath(request: Request, offset = -1) {
  return new URL(request.url).pathname.split("/").at(offset) ?? "";
}

export async function ownedSession(
  context: Pick<ProtectedRouteContext, "supabase" | "user" | "requestId">,
  id: string,
) {
  if (!sessionIdSchema.safeParse(id).success) {
    return {
      error: protectedError(
        context,
        400,
        "INVALID_REQUEST",
        "Invalid session ID",
      ),
    };
  }
  const { data, error } = await context.supabase
    .from("cooking_sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", context.user.id)
    .maybeSingle();
  if (error)
    return {
      error: protectedError(
        context,
        500,
        "INTERNAL_ERROR",
        "Could not load cooking session",
      ),
    };
  if (!data)
    return {
      error: protectedError(
        context,
        404,
        "NOT_FOUND",
        "Cooking session not found",
      ),
    };
  return { data };
}

export function rpcError(
  context: Pick<ProtectedRouteContext, "requestId">,
  error: { code?: string } | null,
) {
  if (error?.code === "P0002")
    return protectedError(
      context,
      404,
      "NOT_FOUND",
      "Cooking session not found",
    );
  if (error?.code === "22023")
    return protectedError(
      context,
      400,
      "INVALID_REQUEST",
      "This session cannot be changed",
    );
  return protectedError(
    context,
    500,
    "INTERNAL_ERROR",
    "Could not update cooking session",
  );
}
