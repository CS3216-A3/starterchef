import { createHash, randomUUID } from "node:crypto";
import {
  inspectKitchenImage,
  KITCHEN_IMAGE_MAX_BYTES,
} from "@/lib/image-upload";
import { protectedError, withProtectedRoute } from "@/lib/protected-route";
import { createAdminClient } from "@/lib/supabase/admin";

/** Stores one private image for a recipe draft. No client-created storage
 * metadata or data URLs are accepted at this boundary. */
export const POST = withProtectedRoute(async ({ request, requestId, user }) => {
  const form = await request.formData().catch(() => null);
  const file = form?.get("image");
  if (
    !(file instanceof File) ||
    file.size < 1 ||
    file.size > KITCHEN_IMAGE_MAX_BYTES
  ) {
    return protectedError(
      { requestId },
      400,
      "INVALID_REQUEST",
      "Provide one JPEG, PNG, or WebP image up to 4 MiB",
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = inspectKitchenImage(file.type, bytes);
  if (!image)
    return protectedError(
      { requestId },
      400,
      "INVALID_REQUEST",
      "Image dimensions or file type are invalid",
    );
  const id = randomUUID();
  const objectPath = `${user.id}/${id}.${image.extension}`;
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("recipe-inputs")
    .upload(objectPath, bytes, {
      contentType: image.contentType,
      upsert: false,
    });
  if (uploadError)
    return protectedError(
      { requestId },
      500,
      "INTERNAL_ERROR",
      "Could not store recipe input",
    );
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const { error: insertError } = await admin.from("recipe_inputs").insert({
    id,
    user_id: user.id,
    object_path: objectPath,
    mime_type: image.contentType,
    size_bytes: bytes.byteLength,
    sha256,
  });
  if (insertError) {
    await admin.storage.from("recipe-inputs").remove([objectPath]);
    return protectedError(
      { requestId },
      500,
      "INTERNAL_ERROR",
      "Could not create recipe input",
    );
  }
  return Response.json({ inputId: id }, { status: 201 });
});
