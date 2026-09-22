"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { KitchenItemKind } from "@/lib/types";

export interface KitchenItemInput {
  kind: KitchenItemKind;
  name: string;
  quantity?: string | null;
  expiresOn?: string | null;
  icon?: string | null;
  source?: "manual" | "scan";
}

function revalidateKitchen() {
  revalidatePath("/kitchen");
  revalidatePath("/today");
}

/**
 * Merge detected/typed items into kitchen_items. Matching is
 * (user_id, kind, lower(name)) — an existing row is updated, never replaced
 * or deleted, so scans can't wipe the inventory.
 */
export async function saveKitchenItems(items: KitchenItemInput[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const rows = items
    .filter((item) => item.name.trim().length > 0)
    .map((item) => ({
      user_id: user.id,
      kind: item.kind,
      // Title-case-ish normalization keeps the merge index stable.
      name: item.name.trim(),
      quantity: item.quantity ?? null,
      expires_on: item.expiresOn ?? null,
      icon: item.icon ?? null,
      source: item.source ?? "manual",
    }));
  if (rows.length === 0) return { error: "Nothing to save" };

  // Manual merge: PostgREST can't upsert against the expression index
  // (user_id, kind, lower(name)), so we look up existing rows ourselves.
  // Matches update quantity/expiry; misses insert — nothing is ever deleted.
  const { data: existing } = await supabase
    .from("kitchen_items")
    .select("id, kind, name")
    .eq("user_id", user.id);
  const keyOf = (kind: string, name: string) =>
    `${kind}:${name.trim().toLowerCase()}`;
  const existingByKey = new Map(
    ((existing ?? []) as { id: string; kind: string; name: string }[]).map(
      (row) => [keyOf(row.kind, row.name), row.id],
    ),
  );

  for (const row of rows) {
    const existingId = existingByKey.get(keyOf(row.kind, row.name));
    if (existingId) {
      const { error } = await supabase
        .from("kitchen_items")
        .update({
          quantity: row.quantity,
          expires_on: row.expires_on,
          // A manual re-add shouldn't wipe an AI-picked icon.
          ...(row.icon ? { icon: row.icon } : {}),
          source: row.source,
        })
        .eq("id", existingId);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase.from("kitchen_items").insert(row);
      if (error) return { error: error.message };
    }
  }

  revalidateKitchen();
  return { ok: true, count: rows.length };
}

/** Form action for the manual "add item" form on /kitchen. */
export async function addKitchenItem(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "ingredient");
  if (!name || (kind !== "ingredient" && kind !== "equipment")) return;
  await saveKitchenItems([{ kind: kind as KitchenItemKind, name }]);
}

export async function removeKitchenItem(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("kitchen_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  revalidateKitchen();
}
