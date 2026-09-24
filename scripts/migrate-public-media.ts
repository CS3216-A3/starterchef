/** One-time, resumable migration of public Storage objects. Default is a
 * read-only inventory; --resume copies, verifies, updates references, and
 * deletes each source only after every preceding step succeeds. */
import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());
const mode = process.argv.includes("--resume")
  ? "resume"
  : process.argv.includes("--audit")
    ? "audit"
    : "dry-run";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Supabase URL and secret key are required");
const db = createClient(url, key, { auth: { persistSession: false } });
const sourceBucket = "recipe-images";
const ownerPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ListedObject = { path: string; mimeType?: string };
async function inventory(prefix = ""): Promise<ListedObject[]> {
  const found: ListedObject[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await db.storage.from(sourceBucket).list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error("Could not inventory public Storage");
    for (const item of data ?? []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) found.push(...(await inventory(path)));
      else found.push({ path, mimeType: item.metadata?.mimetype });
    }
    if ((data?.length ?? 0) < 100) break;
  }
  return found;
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function download(bucket: string, path: string) {
  const { data, error } = await db.storage.from(bucket).download(path);
  if (error || !data) throw new Error("Could not download Storage object");
  return new Uint8Array(await data.arrayBuffer());
}

const referenceTables = [
  { name: "recipes", columns: ["image_url", "steps"] },
  { name: "cooking_sessions", columns: ["recipe"] },
  {
    name: "recipe_drafts",
    columns: ["request", "canonical_recipe", "verification"],
  },
  { name: "session_events", columns: ["payload"] },
  { name: "recipe_feedback", columns: ["learned"] },
  { name: "kitchen_scans", columns: ["candidates", "accepted"] },
] as const;

function replacementFor(
  value: string,
  sourcePath: string,
  destination: string,
) {
  if (value === `recipe-images:${sourcePath}`) return destination;
  try {
    const parsed = new URL(value);
    const marker = "/storage/v1/object/public/recipe-images/";
    const at = parsed.pathname.indexOf(marker);
    if (
      at >= 0 &&
      decodeURIComponent(parsed.pathname.slice(at + marker.length)) ===
        sourcePath
    )
      return destination;
  } catch {
    // Opaque references that do not match the bucket remain unchanged.
  }
  return value;
}

function replaceReferences(
  value: unknown,
  sourcePath: string,
  destination: string,
): unknown {
  if (typeof value === "string")
    return replacementFor(value, sourcePath, destination);
  if (Array.isArray(value))
    return value.map((item) =>
      replaceReferences(item, sourcePath, destination),
    );
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replaceReferences(item, sourcePath, destination),
      ]),
    );
  return value;
}

async function updateReferences(sourcePath: string, destination: string) {
  for (const table of referenceTables) {
    for (let start = 0; ; start += 100) {
      const columns = table.columns.join(",");
      const { data, error } = await db
        .from(table.name)
        .select(`id,${columns}`)
        .order("id", { ascending: true })
        .range(start, start + 99);
      if (error) throw new Error(`Could not inspect ${table.name} references`);
      for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
        const patch: Record<string, unknown> = {};
        for (const column of table.columns) {
          const original = row[column];
          const updated = replaceReferences(original, sourcePath, destination);
          if (JSON.stringify(original) !== JSON.stringify(updated))
            patch[column] = updated;
        }
        if (!Object.keys(patch).length) continue;
        const updated =
          table.name === "recipes"
            ? await db.rpc("migrate_recipe_media_service", {
                p_recipe_id: row.id,
                p_image_url: patch.image_url ?? row.image_url,
                p_steps: patch.steps ?? row.steps,
              })
            : await db.from(table.name).update(patch).eq("id", row.id);
        if (updated.error)
          throw new Error(`Could not update ${table.name} reference`);
      }
      if ((data?.length ?? 0) < 100) break;
    }
  }
}

async function copyAndVerify(
  item: ListedObject,
  destinationBucket: string,
  destinationPath: string,
) {
  const original = await download(sourceBucket, item.path);
  const uploaded = await db.storage
    .from(destinationBucket)
    .upload(destinationPath, original, {
      contentType: item.mimeType ?? "application/octet-stream",
      upsert: false,
    });
  // A previous partial run may already have copied this object. Verify it
  // rather than overwriting it or assuming a conflict means success.
  if (uploaded.error && uploaded.error.statusCode !== "409")
    throw new Error("Could not copy public Storage object");
  const copied = await download(destinationBucket, destinationPath);
  if (
    copied.byteLength !== original.byteLength ||
    sha256(copied) !== sha256(original)
  )
    throw new Error("Copied Storage object did not verify");
}

async function migrate(item: ListedObject) {
  const owner = item.path.split("/")[0];
  const isUser = ownerPattern.test(owner);
  const destinationBucket = isUser ? "recipe-inputs" : "recipe-catalogue";
  const destinationPath = isUser
    ? `${owner}/migrated/${item.path.slice(owner.length + 1)}`
    : item.path;
  const destination = isUser
    ? `recipe-inputs:${destinationPath}`
    : `${url}/storage/v1/object/public/recipe-catalogue/${destinationPath.split("/").map(encodeURIComponent).join("/")}`;
  await copyAndVerify(item, destinationBucket, destinationPath);
  await updateReferences(item.path, destination);
  const removed = await db.storage.from(sourceBucket).remove([item.path]);
  if (removed.error) throw new Error("Could not delete verified public source");
}

async function main() {
  const objects = await inventory();
  const users = objects.filter((item) =>
    ownerPattern.test(item.path.split("/")[0]),
  );
  const catalogue = objects.length - users.length;
  console.info(
    JSON.stringify({
      mode,
      publicUserObjects: users.length,
      catalogueObjects: catalogue,
    }),
  );
  if (mode === "audit") {
    if (users.length) process.exitCode = 1;
    return;
  }
  if (mode === "dry-run") return;
  let migrated = 0;
  let failed = 0;
  for (const item of objects) {
    try {
      await migrate(item);
      migrated++;
    } catch {
      failed++;
    }
  }
  console.info(JSON.stringify({ migrated, failed }));
  if (failed) process.exitCode = 1;
}

void main().catch(() => {
  console.error("Public media inventory or migration failed");
  process.exitCode = 1;
});
