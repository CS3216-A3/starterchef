import { randomUUID } from "node:crypto";
import { z } from "zod";
import { measuredGenerate, safeAiFailureCode } from "@/lib/ai/instrument";
import { getModel } from "@/lib/ai/model";
import { renderPrompt } from "@/lib/ai/prompts";
import { kitchenScanSchema } from "@/lib/ai/schemas/kitchen-scan";
import type { KitchenScanResult } from "@/lib/ai/schemas/kitchen-scan";
import { scanCandidatesSchema } from "@/lib/ai/schemas/kitchen-scan-record";
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

function logScanFailure(requestId: string, code: string) {
  console.error(
    JSON.stringify({
      route: "/api/kitchen-scans",
      requestId,
      code,
    }),
  );
}

export const POST = withProtectedRoute(async ({ request, requestId, user }) => {
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
      "Image must be between 1 byte and 4 MiB",
    );
  }
  const admin = createAdminClient();
  // Claim first.  A duplicate idempotency key never reaches quota, storage,
  // or a model, even when two browser retries race each other.
  const scanId = randomUUID();
  const objectPath = `${user.id}/${scanId}`;
  const { data: claimed, error: claimError } = await admin
    .from("kitchen_scans")
    .upsert(
      {
        id: scanId,
        user_id: user.id,
        object_path: objectPath,
        idempotency_key: parsed.data.idempotencyKey,
        status: "processing",
      },
      { onConflict: "user_id,idempotency_key", ignoreDuplicates: true },
    )
    .select("id,status,candidates,failure_code,expires_at");
  if (claimError)
    return protectedError(
      { requestId },
      500,
      "INTERNAL_ERROR",
      "Could not create kitchen scan",
    );
  if (!claimed?.length) {
    const { data: existing } = await admin
      .from("kitchen_scans")
      .select("id,status,candidates,failure_code,expires_at")
      .eq("user_id", user.id)
      .eq("idempotency_key", parsed.data.idempotencyKey)
      .single();
    if (!existing)
      return protectedError(
        { requestId },
        500,
        "INTERNAL_ERROR",
        "Could not load kitchen scan",
      );
    return Response.json(publicScan(existing), {
      status: existing.status === "processing" ? 202 : 200,
    });
  }
  const scan = claimed[0];

  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = inspectKitchenImage(file.type, bytes);
  if (!image) {
    await admin
      .from("kitchen_scans")
      .update({
        status: "failed",
        failure_code: "INVALID_IMAGE",
        updated_at: new Date().toISOString(),
      })
      .eq("id", scan.id);
    return protectedError(
      { requestId },
      400,
      "INVALID_REQUEST",
      "Image must be a valid JPEG, PNG, or WebP image within the size limits",
    );
  }
  const quota = await checkRateLimit(user.id, AI_OPERATION_COSTS.scan, admin);
  if (!quota.allowed) {
    await admin
      .from("kitchen_scans")
      .update({
        status: "failed",
        failure_code: "RATE_LIMITED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", scan.id);
    return protectedError(
      { requestId },
      429,
      "RATE_LIMITED",
      "Daily AI credit limit reached",
    );
  }
  const { error: uploadError } = await admin.storage
    .from("kitchen-images")
    .upload(objectPath, bytes, {
      contentType: image.contentType,
      upsert: false,
    });
  if (uploadError) {
    await admin
      .from("kitchen_scans")
      .update({
        status: "failed",
        failure_code: "STORAGE_UPLOAD_FAILED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", scan.id);
    return protectedError(
      { requestId },
      500,
      "INTERNAL_ERROR",
      "Could not store kitchen scan",
    );
  }

  let failureCode = "VISION_GENERATION_FAILED";
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
            {
              type: "file",
              data: bytes,
              mediaType: image.contentType,
            },
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
    ];
    const validatedCandidates = scanCandidatesSchema.safeParse(candidates);
    if (!validatedCandidates.success) throw new Error("invalid scan result");
    failureCode = "SCAN_RESULT_PERSIST_FAILED";
    const { data: saved, error } = await admin
      .from("kitchen_scans")
      .update({
        candidates: validatedCandidates.data,
        status: "awaiting_confirmation",
        updated_at: new Date().toISOString(),
      })
      .eq("id", scan.id)
      .select("id,status,candidates,failure_code,expires_at")
      .single();
    if (error || !saved) throw new Error("scan persistence failed");
    return Response.json(publicScan(saved), { status: 201 });
  } catch (error) {
    failureCode = `VISION_${safeAiFailureCode(error)}`;
    logScanFailure(requestId, failureCode);
    await admin
      .from("kitchen_scans")
      .update({
        status: "failed",
        failure_code: failureCode,
        updated_at: new Date().toISOString(),
      })
      .eq("id", scan.id);
    await admin.storage.from("kitchen-images").remove([objectPath]);
    return protectedError(
      { requestId },
      502,
      "INTERNAL_ERROR",
      "Kitchen scan is unavailable. Please try a new photo.",
    );
  }
});
