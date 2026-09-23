import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const config = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  aEmail: process.env.SECURITY_USER_A_EMAIL,
  aPassword: process.env.SECURITY_USER_A_PASSWORD,
  bEmail: process.env.SECURITY_USER_B_EMAIL,
  bPassword: process.env.SECURITY_USER_B_PASSWORD,
};
const enabled = Object.values(config).every(Boolean);
const suite = enabled ? describe : describe.skip;

suite("two-user tenant isolation", () => {
  let userA: SupabaseClient;
  let userB: SupabaseClient;
  let userAId: string;
  let itemId: string;
  let objectPath: string;
  const marker = `security-${Date.now()}-${crypto.randomUUID()}`;

  beforeAll(async () => {
    userA = createClient(config.url!, config.key!, {
      auth: { persistSession: false },
    });
    userB = createClient(config.url!, config.key!, {
      auth: { persistSession: false },
    });
    const [a, b] = await Promise.all([
      userA.auth.signInWithPassword({
        email: config.aEmail!,
        password: config.aPassword!,
      }),
      userB.auth.signInWithPassword({
        email: config.bEmail!,
        password: config.bPassword!,
      }),
    ]);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    userAId = a.data.user!.id;
  });

  afterAll(async () => {
    if (itemId) await userA.from("kitchen_items").delete().eq("id", itemId);
    if (objectPath)
      await userA.storage.from("kitchen-images").remove([objectPath]);
  });

  it("merges concurrent normalized duplicates into one owner-scoped row", async () => {
    const payload = [
      { kind: "ingredient", name: ` ${marker} `, quantity: "1" },
    ];
    const results = await Promise.all([
      userA.rpc("merge_kitchen_items", { p_items: payload }),
      userA.rpc("merge_kitchen_items", {
        p_items: [{ ...payload[0], name: marker.toUpperCase(), quantity: "2" }],
      }),
    ]);
    expect(results.every((result) => !result.error)).toBe(true);

    const { data, error } = await userA
      .from("kitchen_items")
      .select("id, user_id, name")
      .ilike("name", marker);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0].user_id).toBe(userAId);
    itemId = data![0].id;

    const byB = await userB.from("kitchen_items").select("id").eq("id", itemId);
    expect(byB.error).toBeNull();
    expect(byB.data).toEqual([]);
  });

  it("prevents user B from accessing user A private media", async () => {
    objectPath = `${userAId}/${crypto.randomUUID()}.png`;
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const uploaded = await userA.storage
      .from("kitchen-images")
      .upload(objectPath, png, {
        contentType: "image/png",
      });
    expect(uploaded.error).toBeNull();

    const [listed, downloaded, signed, overwritten, removed] =
      await Promise.all([
        userB.storage.from("kitchen-images").list(userAId),
        userB.storage.from("kitchen-images").download(objectPath),
        userB.storage.from("kitchen-images").createSignedUrl(objectPath, 60),
        userB.storage.from("kitchen-images").upload(objectPath, png, {
          contentType: "image/png",
          upsert: true,
        }),
        userB.storage.from("kitchen-images").remove([objectPath]),
      ]);
    expect(listed.data ?? []).toEqual([]);
    expect(downloaded.error).not.toBeNull();
    expect(signed.error).not.toBeNull();
    expect(overwritten.error).not.toBeNull();
    expect(removed.data ?? []).toEqual([]);
  });
});
