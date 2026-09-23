import { randomUUID } from "node:crypto";
import { apiError } from "@/lib/api-error";
import {
  inspectKitchenImage,
  KITCHEN_IMAGE_MAX_BYTES,
} from "@/lib/image-upload";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentication required");

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return apiError(400, "INVALID_REQUEST", "A single image file is required");
  }
  if (file.size === 0 || file.size > KITCHEN_IMAGE_MAX_BYTES) {
    return apiError(
      400,
      "INVALID_REQUEST",
      "Image must be between 1 byte and 8 MiB",
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const inspected = inspectKitchenImage(file.type, bytes);
  if (!inspected) {
    return apiError(
      400,
      "INVALID_REQUEST",
      "Image must be a valid JPEG, PNG, or WebP file",
    );
  }

  const path = `${user.id}/${randomUUID()}.${inspected.extension}`;
  const { error } = await supabase.storage
    .from("kitchen-images")
    .upload(path, bytes, {
      contentType: inspected.contentType,
      upsert: false,
    });
  if (error) {
    console.error("kitchen image upload failed", { code: error.name });
    return apiError(500, "INTERNAL_ERROR", "Could not upload image");
  }
  return Response.json(
    { path, contentType: inspected.contentType, size: file.size },
    { status: 201 },
  );
}
