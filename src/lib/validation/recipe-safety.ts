/** Conservative deterministic guard shared by reviewed drafts and direct
 * manual owner edits. This is a baseline, not a substitute for food-safety
 * judgement or the draft verifier. */
export function recipeSafetyFailure(
  recipe: { ingredients: string[]; steps: { instruction: string }[] },
  constraints: {
    dietary_restrictions?: string[] | null;
    allergies?: string[] | null;
  } | null,
): "DIET_OR_ALLERGEN_CONFLICT" | "UNSAFE_INSTRUCTION" | null {
  const words = [
    ...(constraints?.dietary_restrictions ?? []),
    ...(constraints?.allergies ?? []),
  ]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const ingredients = recipe.ingredients.join(" ").toLowerCase();
  if (words.some((word) => ingredients.includes(word)))
    return "DIET_OR_ALLERGEN_CONFLICT";
  const instructions = recipe.steps.map((step) => step.instruction).join(" ");
  if (
    /(eat raw chicken|undercook poultry|leave.*room temperature.*overnight)/i.test(
      instructions,
    )
  )
    return "UNSAFE_INSTRUCTION";
  return null;
}

/** Reject obvious hazards in a proposed replacement before a privileged RPC
 * can alter the active snapshot. The database repeats this minimum guard. */
export function cookingAdjustmentFailure(
  instruction: string,
  profile: {
    dietary_restrictions?: string[] | null;
    allergies?: string[] | null;
  } | null,
): "DIET_OR_ALLERGEN_CONFLICT" | "UNSAFE_INSTRUCTION" | null {
  if (
    /(eat raw (chicken|poultry)|undercook (chicken|poultry)|leave.{0,80}room temperature.{0,80}overnight|serve (chicken|poultry).{0,30}(raw|pink))/i.test(
      instruction,
    )
  )
    return "UNSAFE_INSTRUCTION";
  const lower = instruction.toLowerCase();
  const has = (word: string) =>
    new RegExp(
      `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i",
    ).test(lower);
  if (profile?.allergies?.some((item) => item.trim() && has(item.trim())))
    return "DIET_OR_ALLERGEN_CONFLICT";
  const diets = new Set(
    profile?.dietary_restrictions?.map((item) => item.toLowerCase()) ?? [],
  );
  if (
    (diets.has("vegan") &&
      [
        "chicken",
        "beef",
        "pork",
        "fish",
        "shrimp",
        "milk",
        "butter",
        "cheese",
        "egg",
        "honey",
      ].some(has)) ||
    (diets.has("vegetarian") &&
      ["chicken", "beef", "pork", "fish", "shrimp"].some(has))
  )
    return "DIET_OR_ALLERGEN_CONFLICT";
  return null;
}
