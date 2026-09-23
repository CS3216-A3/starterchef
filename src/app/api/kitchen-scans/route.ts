import { randomUUID } from "node:crypto";
import { z } from "zod";
import { measuredGenerate } from "@/lib/ai/instrument";
import { getModel } from "@/lib/ai/model";
import { renderPrompt } from "@/lib/ai/prompts";
import { kitchenScanSchema } from "@/lib/ai/schemas/kitchen-scan";
import type { KitchenScanResult } from "@/lib/ai/schemas/kitchen-scan";
import { AI_OPERATION_COSTS } from "@/lib/ai/route";
import { checkRateLimit } from "@/lib/rate-limit";
import { protectedError, withProtectedRoute } from "@/lib/protected-route";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  inspectKitchenImage,
  KITCHEN_IMAGE_MAX_BYTES,
} from "@/lib/image-upload";

const createSchema = z.object({ idempotencyKey: z.uuid() });

function publicScan(row: Record<string, unknown>) {
  return {
    id: row.id,
    status: row.status,
    candidates: row.candidates ?? [],
    failureCode: row.failure_code ?? null,
    expiresAt: row.expires_at,
  };
}

export const POST = withProtectedRoute(
  async ({ request, requestId, user, supabase }) => {
    const form = await request.formData().catch(() => null);
    const parsed = createSchema.safeParse({
      idempotencyKey: form?.get("idempotencyKey"),
    });
    const file = form?.get("image");
    if (!parsed.success || !(file instanceof File)) {
      return protectedError(
        { requestId },
        400,
        "INVALID_REQUEST",
        "An image and a valid idempotency key are required",
      );
    }
    if (file.size < 1 || file.size > KITCHEN_IMAGE_MAX_BYTES) {
      return protectedError(
        { requestId },
        400,
        "INVALID_REQUEST",
        "Image must be between 1 byte and 8 MiB",
      );
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const image = inspectKitchenImage(file.type, bytes);
    if (!image) {
      return protectedError(
        { requestId },
        400,
        "INVALID_REQUEST",
        "Image must be a valid JPEG, PNG, or WebP image within the size limits",
      );
    }

    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("kitchen_scans")
      .select("id,status,candidates,failure_code,expires_at")
      .eq("user_id", user.id)
      .eq("idempotency_key", parsed.data.idempotencyKey)
      .maybeSingle();
    if (existing) return Response.json(publicScan(existing));

    const quota = await checkRateLimit(user.id, AI_OPERATION_COSTS.scan, admin);
    if (!quota.allowed)
      return protectedError(
        { requestId },
        429,
        "RATE_LIMITED",
        "Daily AI credit limit reached",
      );

    const objectPath = `${user.id}/${randomUUID()}.${image.extension}`;
    const { error: uploadError } = await supabase.storage
      .from("kitchen-images")
      .upload(objectPath, bytes, {
        contentType: image.contentType,
        upsert: false,
      });
    if (uploadError)
      return protectedError(
        { requestId },
        500,
        "INTERNAL_ERROR",
        "Could not store kitchen scan",
      );

    const { data: scan, error: insertError } = await admin
      .from("kitchen_scans")
      .insert({
        user_id: user.id,
        object_path: objectPath,
        idempotency_key: parsed.data.idempotencyKey,
        status: "processing",
      })
      .select("id")
      .single();
    if (insertError || !scan)
      return protectedError(
        { requestId },
        500,
        "INTERNAL_ERROR",
        "Could not create kitchen scan",
      );

    try {
      const { object: generated } = await measuredGenerate("kitchen-scan", {
        model: getModel("kitchen-scan"),
        schema: kitchenScanSchema,
        temperature: 0.4,
        system: renderPrompt("kitchen-scan", {}),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Identify ingredients and cooking equipment in this photo.",
              },
              { type: "image", image: bytes },
            ],
          },
        ],
      });
      const object = generated as KitchenScanResult;
      const today = Date.now();
      const candidates = [
        ...object.ingredients.map((item) => ({
          id: randomUUID(),
          kind: "ingredient",
          name: item.name.trim(),
          quantity: item.estimatedQuantity?.trim() || null,
          expiresOn: item.expiresWithinDays
            ? new Date(today + item.expiresWithinDays * 86400000)
                .toISOString()
                .slice(0, 10)
            : null,
          icon: item.icon,
          confidence: item.confidence,
        })),
        ...object.equipment.map((item) => ({
          id: randomUUID(),
          kind: "equipment",
          name: item.name.trim(),
          quantity: null,
          expiresOn: null,
          icon: item.icon,
          confidence: item.confidence,
        })),
      ].filter((item) => item.name.length > 0 && item.name.length <= 120);
      const { data: saved, error } = await admin
        .from("kitchen_scans")
        .update({
          candidates,
          status: "awaiting_confirmation",
          updated_at: new Date().toISOString(),
        })
        .eq("id", scan.id)
        .select("id,status,candidates,failure_code,expires_at")
        .single();
      if (error || !saved) throw new Error("scan persistence failed");
      return Response.json(publicScan(saved), { status: 201 });
    } catch {
      await admin
        .from("kitchen_scans")
        .update({
          status: "failed",
          failure_code: "VISION_UNAVAILABLE",
          updated_at: new Date().toISOString(),
        })
        .eq("id", scan.id);
      return protectedError(
        { requestId },
        502,
        "INTERNAL_ERROR",
        "Kitchen scan is unavailable. Please try a new photo.",
      );
    }
  },
);
