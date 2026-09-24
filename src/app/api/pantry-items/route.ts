import { protectedError, withProtectedRoute } from "@/lib/protected-route";
import { pantryItemSchema } from "@/lib/validation/pantry";

export const GET = withProtectedRoute(async ({ supabase, user, requestId }) => {
  const { data, error } = await supabase
    .from("kitchen_items")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("pantry read failed", { code: error.code });
    return protectedError(
      { requestId },
      500,
      "INTERNAL_ERROR",
      "Could not load pantry items",
    );
  }
  return Response.json({ items: data ?? [] });
});

export const POST = withProtectedRoute(
  async ({ request, supabase, requestId }) => {
    const parsed = pantryItemSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return protectedError(
        { requestId },
        400,
        "INVALID_REQUEST",
        "Invalid pantry item",
      );
    }
    const { data, error } = await supabase.rpc("merge_kitchen_items", {
      p_items: [parsed.data],
    });
    if (error) {
      console.error("pantry merge failed", { code: error.code });
      return protectedError(
        { requestId },
        500,
        "INTERNAL_ERROR",
        "Could not save pantry item",
      );
    }
    const [row] = (data ?? []) as Array<
      Record<string, unknown> & { created: boolean }
    >;
    if (!row)
      return protectedError(
        { requestId },
        500,
        "INTERNAL_ERROR",
        "Could not save pantry item",
      );
    const { created, ...item } = row;
    return Response.json({ item, created }, { status: created ? 201 : 200 });
  },
);
