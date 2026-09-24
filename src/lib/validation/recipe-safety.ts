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
