import { describe, expect, it } from "vitest";
import { rankEligibleRecipes, validateAiRanking } from "@/lib/recommendations";
import type { KitchenItemRow, ProfileRow, RecipeRow } from "@/lib/types";

const recipe = (id: string, overrides: Partial<RecipeRow> = {}): RecipeRow => ({
  id,
  slug: id,
  title: id,
  description: "",
  minutes: 20,
  difficulty: "easy",
  servings: 2,
  why_good: "",
  icon: "",
  image_tint: "",
  image_url: null,
  ingredients: ["tomato"],
  equipment: ["pan"],
  steps: [],
  tags: ["vegetarian"],
  source: "",
  source_url: null,
  user_id: null,
  parent_recipe_id: null,
  is_personalized: false,
  created_at: "",
  ...overrides,
});
const pantry: KitchenItemRow[] = [
  {
    id: "1",
    user_id: "u",
    kind: "ingredient",
    name: "Tomato",
    quantity: null,
    expires_on: null,
    icon: null,
    source: "manual",
    created_at: "",
  },
  {
    id: "2",
    user_id: "u",
    kind: "equipment",
    name: "Pan",
    quantity: null,
    expires_on: null,
    icon: null,
    source: "manual",
    created_at: "",
  },
];
const profile: ProfileRow = {
  id: "u",
  display_name: null,
  dietary_restrictions: ["vegetarian"],
  allergies: ["peanut"],
  taste_preferences: {},
  skill_level: "beginner",
  household_size: 2,
  onboarded_at: "",
};

describe("trusted recipe ranking", () => {
  it("filters unsafe recipes before ranking", () => {
    const eligible = rankEligibleRecipes(
      [
        recipe("safe"),
        recipe("allergen", { ingredients: ["peanut oil"] }),
        recipe("hard", { difficulty: "hard" }),
        recipe("oven", { equipment: ["oven"] }),
        recipe("slow", { minutes: 80 }),
      ],
      pantry,
      profile,
      [],
      { maxMinutes: 30, servings: 2 },
    );
    expect(eligible.map((item) => item.recipe.id)).toEqual(["safe"]);
  });

  it("drops fabricated and duplicate model IDs", () => {
    const eligible = rankEligibleRecipes(
      [recipe("safe")],
      pantry,
      profile,
      [],
      {},
    );
    expect(
      validateAiRanking(
        [
          { id: "made-up", reason: "no" },
          { id: "safe", reason: "good" },
          { id: "safe", reason: "duplicate" },
        ],
        eligible,
      ),
    ).toMatchObject([{ recipe: { id: "safe" }, reason: "good" }]);
  });
});
