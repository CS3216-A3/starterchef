import "server-only";
import { renderPrompt } from "@/lib/ai/prompts";
import { getCookingMemory } from "@/lib/session-events";
import { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

export async function loadCookingAssistantContext(
  supabase: Db,
  userId: string,
  sessionId: string,
) {
  const [
    { data: session, error: sessionError },
    { data: profile, error: profileError },
    { data: pantry, error: pantryError },
    memory,
  ] = await Promise.all([
    supabase
      .from("cooking_sessions")
      .select("id,recipe,current_step,status,adjustments")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("dietary_restrictions,allergies")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("kitchen_items")
      .select("kind,name,quantity")
      .eq("user_id", userId)
      .limit(50),
    getCookingMemory(supabase, userId),
  ]);
  if (sessionError || profileError || pantryError)
    throw new Error("COOKING_CONTEXT_UNAVAILABLE");
  return { session, profile, pantry: pantry ?? [], memory };
}

export type CookingAssistantContext = Awaited<
  ReturnType<typeof loadCookingAssistantContext>
>;

export function activeCookingContext(context: CookingAssistantContext) {
  const session = context.session;
  if (!session || session.status !== "in_progress") return null;
  const recipe = session.recipe as {
    title?: string;
    ingredients?: string[];
    equipment?: string[];
    steps?: { index?: number; title?: string; instruction?: string }[];
  };
  const step = recipe.steps?.find(
    (item) => item.index === session.current_step,
  );
  if (!recipe.title || !step?.title || !step.instruction) return null;
  return { ...context, session, recipe, step };
}

export function cookingPrompt(
  context: NonNullable<ReturnType<typeof activeCookingContext>>,
  mode: "text" | "live",
) {
  const list = (items: string[] | null | undefined, max = 25) =>
    items?.length
      ? items
          .slice(0, max)
          .map((item) => item.slice(0, 120))
          .join(", ")
      : "none";
  const memory =
    context.memory
      .slice(0, 10)
      .map((item) => `- ${item.slice(0, 240)}`)
      .join("\n") || "- Nothing recorded yet.";
  return renderPrompt(mode === "live" ? "cooking-live" : "cooking-assistant", {
    recipeTitle: context.recipe.title!,
    stepTitle: context.step.title!,
    stepInstruction: context.step.instruction!,
    recipeIngredients: list(context.recipe.ingredients),
    recipeEquipment: list(context.recipe.equipment),
    memory,
    dietaryRestrictions: list(context.profile?.dietary_restrictions),
    allergies: list(context.profile?.allergies),
    pantry:
      context.pantry
        .map(
          (item) =>
            `${item.kind}: ${item.name.slice(0, 80)}${item.quantity ? ` (${String(item.quantity).slice(0, 40)})` : ""}`,
        )
        .join(", ") || "none",
    adjustments: JSON.stringify(context.session.adjustments ?? []).slice(
      0,
      2000,
    ),
  });
}
