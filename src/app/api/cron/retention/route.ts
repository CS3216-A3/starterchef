import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!expected || !provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Daily retention job. It purges objects first and metadata second; failed
 * object removals leave metadata for the following daily run to retry. */
export async function GET(request: Request) {
  if (!authorized(request))
    return new Response("Unauthorized", { status: 401 });
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: inputs } = await admin
    .from("recipe_inputs")
    .select("id,object_path")
    .lt("expires_at", now)
    .limit(500);
  const inputPaths = (inputs ?? []).map((input) => input.object_path);
  if (inputPaths.length) {
    const { error } = await admin.storage
      .from("recipe-inputs")
      .remove(inputPaths);
    if (!error)
      await admin
        .from("recipe_inputs")
        .delete()
        .in(
          "id",
          (inputs ?? []).map((input) => input.id),
        );
  }
  const { data: events } = await admin
    .from("session_events")
    .select("id,payload")
    .lt("expires_at", now)
    .limit(1000);
  const checkpointPaths = (events ?? []).flatMap((event) => {
    const ref = (event.payload as { photoUrl?: unknown }).photoUrl;
    return typeof ref === "string" && ref.startsWith("recipe-inputs:")
      ? [ref.slice("recipe-inputs:".length)]
      : [];
  });
  if (checkpointPaths.length)
    await admin.storage.from("recipe-inputs").remove(checkpointPaths);
  if (events?.length)
    await admin
      .from("session_events")
      .delete()
      .in(
        "id",
        events.map((event) => event.id),
      );
  return Response.json({
    purgedInputs: inputPaths.length,
    purgedEvents: events?.length ?? 0,
  });
}
