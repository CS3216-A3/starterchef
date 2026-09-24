import { z } from "zod";
import { scanAcceptanceSchema } from "@/lib/ai/schemas/kitchen-scan-record";
import { protectedError, withProtectedRoute } from "@/lib/protected-route";

export const POST = withProtectedRoute(
  async ({ request, supabase, requestId }) => {
    const segments = new URL(request.url).pathname.split("/");
    const scanId = segments.at(-2) ?? "";
    if (!z.uuid().safeParse(scanId).success)
      return protectedError(
        { requestId },
        400,
        "INVALID_REQUEST",
        "Invalid scan ID",
      );
    const parsed = scanAcceptanceSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success)
      return protectedError(
        { requestId },
        400,
        "INVALID_REQUEST",
        "Select at least one valid detected item",
      );
    const { data, error } = await supabase.rpc("apply_kitchen_scan", {
      scan_id: scanId,
      accepted: parsed.data,
    });
    if (error) {
      const code =
        error.code === "P0002"
          ? "NOT_FOUND"
          : error.code === "23505"
            ? "CONFLICT"
            : "INVALID_REQUEST";
      return protectedError(
        { requestId },
        code === "NOT_FOUND" ? 404 : code === "CONFLICT" ? 409 : 400,
        code,
        code === "CONFLICT"
          ? "This scan was already applied"
          : "Kitchen scan cannot be applied",
      );
    }
    return Response.json({ items: data ?? [] });
  },
);
