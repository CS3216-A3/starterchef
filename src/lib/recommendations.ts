import type {
  KitchenItemRow,
  ProfileRow,
  RecipeFeedbackRow,
  RecipeRow,
} from "@/lib/types";

const difficultyRank = { easy: 0, medium: 1, hard: 2 } as const;
const skillRank = { beginner: 0, intermediate: 1, advanced: 2 } as const;
const normalise = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ");

export interface RecommendationFilters {
  maxMinutes?: number;
  servings?: number;
}
export interface RankedRecipe {
  recipe: RecipeRow;
  score: number;
  pantryMatches: string[];
}

export function rankEligibleRecipes(
  recipes: RecipeRow[],
  pantry: KitchenItemRow[],
  profile: ProfileRow | null,
  feedback: Pick<
    RecipeFeedbackRow,
    "recipe_id" | "rating" | "would_cook_again"
  >[],
  filters: RecommendationFilters,
): RankedRecipe[] {
  const ingredients = pantry
    .filter((item) => item.kind === "ingredient")
    .map((item) => normalise(item.name));
  const equipment = new Set(
    pantry
      .filter((item) => item.kind === "equipment")
      .map((item) => normalise(item.name)),
  );
  const restrictions = (profile?.dietary_restrictions ?? [])
    .map(normalise)
    .filter(Boolean);
  const allergies = (profile?.allergies ?? []).map(normalise).filter(Boolean);
  const skill = profile?.skill_level ?? "beginner";
  const feedbackByRecipe = new Map<string, number>();
  for (const entry of feedback) {
    feedbackByRecipe.set(
      entry.recipe_id,
      (feedbackByRecipe.get(entry.recipe_id) ?? 0) +
        (entry.would_cook_again ? 3 : 0) +
        (entry.rating && entry.rating >= 4 ? 1 : 0),
    );
  }
  return recipes
    .flatMap((recipe) => {
      const recipeIngredients = recipe.ingredients.map(normalise);
      const recipeEquipment = recipe.equipment.map(normalise);
      const tags = new Set(recipe.tags.map(normalise));
      const allergyConflict = allergies.some((allergy) =>
        recipeIngredients.some(
          (ingredient) =>
            ingredient.includes(allergy) || allergy.includes(ingredient),
        ),
      );
      const matches = recipeIngredients.filter((ingredient) =>
        ingredients.some(
          (owned) => owned.includes(ingredient) || ingredient.includes(owned),
        ),
      );
      const allowed =
        (!filters.maxMinutes || recipe.minutes <= filters.maxMinutes) &&
        (!filters.servings || recipe.servings >= filters.servings) &&
        difficultyRank[recipe.difficulty] <= skillRank[skill] &&
        recipeEquipment.every((item) => equipment.has(item)) &&
        restrictions.every((restriction) => tags.has(restriction)) &&
        !allergyConflict;
      return allowed
        ? [
            {
              recipe,
              pantryMatches: matches,
              score:
                matches.length * 10 +
                (feedbackByRecipe.get(recipe.id) ?? 0) -
                recipe.minutes / 1000,
            },
          ]
        : [];
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.recipe.minutes - b.recipe.minutes ||
        a.recipe.id.localeCompare(b.recipe.id),
    );
}

export function validateAiRanking(
  rankings: Array<{ id: string; reason: string }>,
  eligible: RankedRecipe[],
) {
  const eligibleById = new Map(eligible.map((item) => [item.recipe.id, item]));
  const used = new Set<string>();
  return rankings.flatMap((ranking) => {
    const item = eligibleById.get(ranking.id);
    if (!item || used.has(ranking.id)) return [];
    used.add(ranking.id);
    return [
      {
        ...item,
        reason:
          ranking.reason.trim().slice(0, 240) ||
          `Uses ${item.pantryMatches.join(", ") || "your kitchen"}.`,
      },
    ];
  });
}
