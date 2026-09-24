import { z } from "zod";
import { protectedError, withProtectedRoute } from "@/lib/protected-route";

const paramsSchema = z.uuid();

export const GET = withProtectedRoute(
  async ({ request, supabase, requestId }) => {
    const scanId = new URL(request.url).pathname.split("/").at(-1) ?? "";
    if (!paramsSchema.safeParse(scanId).success)
      return protectedError(
        { requestId },
        400,
        "INVALID_REQUEST",
        "Invalid scan ID",
      );
    const { data, error } = await supabase
      .from("kitchen_scans")
      .select("id,status,candidates,failure_code,expires_at")
      .eq("id", scanId)
      .maybeSingle();
    if (error)
      return protectedError(
        { requestId },
        500,
        "INTERNAL_ERROR",
        "Could not load kitchen scan",
      );
    if (!data)
      return protectedError(
        { requestId },
        404,
        "NOT_FOUND",
        "Kitchen scan not found",
      );
    return Response.json({
      id: data.id,
      status: data.status,
      candidates: data.candidates ?? [],
      failureCode: data.failure_code ?? null,
      expiresAt: data.expires_at,
    });
  },
);
