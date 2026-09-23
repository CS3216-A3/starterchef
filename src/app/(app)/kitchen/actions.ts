"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { KitchenItemKind } from "@/lib/types";
import { pantryItemsSchema } from "@/lib/validation/pantry";
import { uuidSchema } from "@/lib/validation/actions";
import { safeActionFailure } from "@/lib/action-result";

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

export async function saveKitchenItems(items: KitchenItemInput[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const parsed = pantryItemsSchema.safeParse(items);
  if (!parsed.success)
    return { error: "Check the pantry item values and try again" };
  const { data, error } = await supabase.rpc("merge_kitchen_items", {
    p_items: parsed.data,
  });
  if (error) return safeActionFailure("save pantry items", error);

  revalidateKitchen();
  return {
    ok: true,
    count: Array.isArray(data) ? data.length : parsed.data.length,
  };
}

export async function addKitchenItem(formData: FormData) {
  const parsed = pantryItemsSchema.safeParse([
    {
      name: formData.get("name"),
      kind: formData.get("kind"),
      source: "manual",
    },
  ]);
  if (!parsed.success) return;
  await saveKitchenItems(parsed.data);
}

export async function removeKitchenItem(formData: FormData) {
  const parsedId = uuidSchema.safeParse(formData.get("id"));
  if (!parsedId.success) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from("kitchen_items")
    .delete()
    .eq("id", parsedId.data)
    .eq("user_id", user.id);
  if (error) {
    safeActionFailure("remove pantry item", error);
    return;
  }
  revalidateKitchen();
}
