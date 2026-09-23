import { randomUUID } from "node:crypto";
import { measuredGenerate } from "@/lib/ai/instrument";
import { getModel } from "@/lib/ai/model";
import { renderPrompt } from "@/lib/ai/prompts";
import { stepCheckSchema, type StepCheck } from "@/lib/ai/schemas/cooking";
import { AI_OPERATION_COSTS } from "@/lib/ai/route";
import {
  inspectKitchenImage,
  KITCHEN_IMAGE_MAX_BYTES,
} from "@/lib/image-upload";
import { privateMediaReference } from "@/lib/private-media";
import { protectedError, withProtectedRoute } from "@/lib/protected-route";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { ownedSession, sessionIdFromPath } from "@/lib/cooking-session-api";

/** A checkpoint can only be evaluated against the actual step held in the
 * active session. The raw object is private and subject to retention. */
export const POST = withProtectedRoute(async (context) => {
  const id = sessionIdFromPath(context.request, -2);
  const known = await ownedSession(context, id);
  if (known.error) return known.error;
  if (known.data.status !== "in_progress")
    return protectedError(
      context,
      409,
      "CONFLICT",
      "Cooking session is no longer active",
    );
  const form = await context.request.formData().catch(() => null);
  const file = form?.get("image");
  const question = form?.get("question");
  if (
    !(file instanceof File) ||
    file.size < 1 ||
    file.size > KITCHEN_IMAGE_MAX_BYTES ||
    (question !== null && typeof question !== "string")
  ) {
    return protectedError(
      context,
      400,
      "INVALID_REQUEST",
      "Provide one valid checkpoint image up to 4 MiB",
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = inspectKitchenImage(file.type, bytes);
  if (!image)
    return protectedError(
      context,
      400,
      "INVALID_REQUEST",
      "Image dimensions or file type are invalid",
    );
  const recipe = known.data.recipe as {
    title?: string;
    steps?: {
      index?: number;
      title?: string;
      instruction?: string;
      photoCheckpoint?: string;
    }[];
  };
  const step = recipe.steps?.find(
    (candidate) => candidate.index === known.data.current_step,
  );
  if (!recipe.title || !step?.title || !step.instruction)
    return protectedError(
      context,
      409,
      "CONFLICT",
      "Cooking session snapshot is incomplete",
    );
  const quota = await checkRateLimit(
    context.user.id,
    AI_OPERATION_COSTS["step-check"],
  );
  if (!quota.allowed)
    return protectedError(
      context,
      429,
      "RATE_LIMITED",
      "Daily AI credit limit reached",
    );
  const { object } = (await measuredGenerate("step-check", {
    model: getModel("step-check"),
    schema: stepCheckSchema,
    temperature: 0.4,
    system: renderPrompt("step-check", {}),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              `Recipe: ${recipe.title}`,
              `Step: ${step.title}`,
              `Instruction: ${step.instruction}`,
              step.photoCheckpoint
                ? `Expected result: ${step.photoCheckpoint}`
                : "",
              typeof question === "string" && question.trim()
                ? `Question: ${question.trim().slice(0, 1000)}`
                : "Does this look right?",
            ]
              .filter(Boolean)
              .join("\n"),
          },
          { type: "file", data: bytes, mediaType: image.contentType },
        ],
      },
    ],
  })) as { object: StepCheck };
  const admin = createAdminClient();
  const path = `${context.user.id}/checkpoints/${id}/${randomUUID()}.${image.extension}`;
  const upload = await admin.storage
    .from("recipe-inputs")
    .upload(path, bytes, { contentType: image.contentType, upsert: false });
  if (upload.error)
    return protectedError(
      context,
      500,
      "INTERNAL_ERROR",
      "Could not store checkpoint image",
    );
  const metadata = {
    stepIndex: known.data.current_step,
    objectPath: path,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
  await context.supabase
    .from("cooking_sessions")
    .update({
      checkpoint_metadata: [
        ...((known.data.checkpoint_metadata as unknown[]) ?? []),
        metadata,
      ],
    })
    .eq("id", id)
    .eq("user_id", context.user.id);
  await context.supabase
    .from("session_events")
    .insert({
      session_id: id,
      user_id: context.user.id,
      step_index: known.data.current_step,
      kind: "photo_check",
      payload: {
        photoUrl: privateMediaReference(path),
        looksRight: object.looksRight,
        feedback: object.feedback,
        tip: object.tip,
      },
      expires_at: metadata.expiresAt,
    });
  return Response.json({
    ...object,
    proposal: object.tip
      ? {
          stepIndex: known.data.current_step,
          title: "Checkpoint suggestion",
          detail: object.tip,
        }
      : null,
  });
});
