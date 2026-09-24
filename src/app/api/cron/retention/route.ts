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

const uuid = "[0-9a-f-]{36}";
export function validRetentionPath(
  kind: "scan" | "input" | "checkpoint" | "event",
  owner: string,
  path: string,
  sessionId?: string,
) {
  if (!new RegExp(`^${uuid}$`, "i").test(owner)) return false;
  if (kind === "scan") return new RegExp(`^${owner}/${uuid}$`, "i").test(path);
  if (kind === "input")
    return new RegExp(`^${owner}/${uuid}\\.(jpg|png|webp)$`, "i").test(path);
  if (kind === "checkpoint")
    return (
      !!sessionId &&
      new RegExp(
        `^${owner}/checkpoints/${sessionId}/${uuid}\\.(jpg|png|webp)$`,
        "i",
      ).test(path)
    );
  if (validRetentionPath("input", owner, path)) return true;
  return new RegExp(
    `^${owner}/checkpoints/${uuid}/${uuid}\\.(jpg|png|webp)$`,
    "i",
  ).test(path);
}

/** Hourly retention. Metadata stays in place whenever object deletion fails,
 * so the next invocation can retry the exact object and row. */
export async function GET(request: Request) {
  if (!authorized(request))
    return new Response("Unauthorized", { status: 401 });
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const counts = {
    scans: 0,
    inputs: 0,
    drafts: 0,
    checkpoints: 0,
    events: 0,
    attempts: 0,
    failed: 0,
  };
  const { error: expiredDraftError } = await admin
    .from("recipe_drafts")
    .update({
      status: "blocked",
      failure_code: "PHOTO_CLARIFICATION_EXPIRED",
      updated_at: now,
    })
    .eq("status", "awaiting_user_input")
    .lte("clarification_expires_at", now);
  if (expiredDraftError)
    return new Response("Could not expire photo clarifications", {
      status: 500,
    });

  const { data: scans, error: scanError } = await admin
    .from("kitchen_scans")
    .select("id,user_id,object_path")
    .lt("expires_at", now)
    .limit(500);
  if (scanError) counts.failed++;
  for (const scan of scans ?? []) {
    if (!validRetentionPath("scan", scan.user_id, scan.object_path)) {
      counts.failed++;
      continue;
    }
    const removed = await admin.storage
      .from("kitchen-images")
      .remove([scan.object_path]);
    if (removed.error) {
      counts.failed++;
      continue;
    }
    const deleted = await admin
      .from("kitchen_scans")
      .delete()
      .eq("id", scan.id)
      .eq("user_id", scan.user_id);
    if (deleted.error) counts.failed++;
    else counts.scans++;
  }

  const { data: checkpoints, error: checkpointError } = await admin
    .from("cooking_checkpoints")
    .select("id,user_id,session_id,object_path")
    .lt("expires_at", now)
    .limit(500);
  if (checkpointError) counts.failed++;
  for (const checkpoint of checkpoints ?? []) {
    if (
      !validRetentionPath(
        "checkpoint",
        checkpoint.user_id,
        checkpoint.object_path,
        checkpoint.session_id,
      )
    ) {
      counts.failed++;
      continue;
    }
    const removed = await admin.storage
      .from("recipe-inputs")
      .remove([checkpoint.object_path]);
    if (removed.error) {
      counts.failed++;
      continue;
    }
    const deleted = await admin
      .from("cooking_checkpoints")
      .delete()
      .eq("id", checkpoint.id)
      .eq("user_id", checkpoint.user_id);
    if (deleted.error) counts.failed++;
    else counts.checkpoints++;
  }

  const { data: inputs, error: inputError } = await admin
    .from("recipe_inputs")
    .select("id,user_id,object_path")
    .lt("expires_at", now)
    .limit(500);
  if (inputError) counts.failed++;
  for (const input of inputs ?? []) {
    if (!validRetentionPath("input", input.user_id, input.object_path)) {
      counts.failed++;
      continue;
    }
    const removed = await admin.storage
      .from("recipe-inputs")
      .remove([input.object_path]);
    if (removed.error) {
      counts.failed++;
      continue;
    }
    const deleted = await admin
      .from("recipe_inputs")
      .delete()
      .eq("id", input.id)
      .eq("user_id", input.user_id);
    if (deleted.error) counts.failed++;
    else counts.inputs++;
  }

  const { data: events, error: eventError } = await admin
    .from("session_events")
    .select("id,user_id,payload")
    .lt("expires_at", now)
    .limit(1000);
  if (eventError) counts.failed++;
  for (const event of events ?? []) {
    const reference = (event.payload as { photoUrl?: unknown }).photoUrl;
    if (
      typeof reference === "string" &&
      reference.startsWith("recipe-inputs:")
    ) {
      const path = reference.slice("recipe-inputs:".length);
      if (!validRetentionPath("event", event.user_id, path)) {
        counts.failed++;
        continue;
      }
      const removed = await admin.storage.from("recipe-inputs").remove([path]);
      if (removed.error) {
        counts.failed++;
        continue;
      }
    }
    const deleted = await admin
      .from("session_events")
      .delete()
      .eq("id", event.id)
      .eq("user_id", event.user_id);
    if (deleted.error) counts.failed++;
    else counts.events++;
  }

  const { data: drafts, error: draftError } = await admin
    .from("recipe_drafts")
    .select("id,user_id")
    .lt("expires_at", now)
    .limit(500);
  if (draftError) counts.failed++;
  for (const draft of drafts ?? []) {
    const purged = await admin.rpc("purge_expired_recipe_draft_service", {
      p_draft_id: draft.id,
    });
    if (purged.error || !purged.data) counts.failed++;
    else counts.drafts++;
  }

  const attempts = await admin
    .from("realtime_attempts")
    .delete()
    .lt("expires_at", now)
    .select("id");
  if (attempts.error) counts.failed++;
  else counts.attempts = attempts.data?.length ?? 0;
  return Response.json(counts, { status: counts.failed ? 503 : 200 });
}
