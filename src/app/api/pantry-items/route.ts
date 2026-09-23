import { apiError } from "@/lib/api-error";
import { createClient } from "@/lib/supabase/server";
import { pantryItemSchema } from "@/lib/validation/pantry";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentication required");

  const { data, error } = await supabase
    .from("kitchen_items")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("pantry read failed", { code: error.code });
    return apiError(500, "INTERNAL_ERROR", "Could not load pantry items");
  }
  return Response.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentication required");

  const parsed = pantryItemSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return apiError(
      400,
      "INVALID_REQUEST",
      "Invalid pantry item",
      parsed.error.flatten(),
    );
  }
  const { data, error } = await supabase.rpc("merge_kitchen_items", {
    p_items: [parsed.data],
  });
  if (error) {
    console.error("pantry merge failed", { code: error.code });
    return apiError(500, "INTERNAL_ERROR", "Could not save pantry item");
  }
  const [row] = (data ?? []) as Array<
    Record<string, unknown> & { created: boolean }
  >;
  if (!row)
    return apiError(500, "INTERNAL_ERROR", "Could not save pantry item");
  const { created, ...item } = row;
  return Response.json({ item, created }, { status: created ? 201 : 200 });
}
