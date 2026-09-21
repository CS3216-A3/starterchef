import { CookingPot, UtensilsCrossed, type LucideIcon } from "lucide-react";

/**
 * @deprecated Pages now read real rows from Supabase (see `src/lib/data.ts`
 * and `supabase/seed/recipes.sql`). This file is kept only as a reference
 * for the shapes the AI layer should emit — do not import it from pages.
 */

export const mockIngredients = ["Eggs", "Tomatoes", "Rice", "Mushrooms"];

export const mockEquipment = ["Frying pan", "Rice cooker"];

export interface RecipeIdea {
  id: string;
  title: string;
  minutes: number;
  difficulty: "Easy" | "Medium" | "Hard";
  servings: number;
  whyGood: string;
  icon: LucideIcon;
  imageTint: string;
  primaryCta?: boolean;
}

export const mockRecipes: RecipeIdea[] = [
  {
    id: "tomato-egg-stir-fry",
    title: "Tomato egg stir-fry",
    minutes: 15,
    difficulty: "Easy",
    servings: 2,
    whyGood: "Uses your eggs and tomatoes",
    icon: CookingPot,
    imageTint: "from-flame-soft to-oat",
    primaryCta: true,
  },
  {
    id: "mushroom-noodles",
    title: "Mushroom noodles",
    minutes: 20,
    difficulty: "Easy",
    servings: 2,
    whyGood: "Made in one pan",
    icon: UtensilsCrossed,
    imageTint: "from-oat to-oat-dark",
  },
];

export interface CookingStep {
  index: number;
  title: string;
  instruction: string;
  durationSeconds?: number;
  ingredients: string[];
  tip?: string;
}

export const mockCookingSession = {
  recipeTitle: "Tomato egg stir-fry",
  steps: [
    {
      index: 1,
      title: "Beat the eggs",
      instruction:
        "Crack 3 eggs into a bowl, add a pinch of salt, and beat until just combined.",
      ingredients: ["3 eggs", "Pinch of salt"],
      tip: "Don't over-beat — a few streaks of white are fine.",
    },
    {
      index: 2,
      title: "Scramble and set aside",
      instruction:
        "Heat oil in the pan, pour in the eggs, and scramble gently until just set. Remove to a plate.",
      durationSeconds: 90,
      ingredients: ["1 tbsp oil"],
    },
    {
      index: 3,
      title: "Soften the tomatoes",
      instruction: "Stir gently until they release their juices.",
      durationSeconds: 120,
      ingredients: ["2 tomatoes", "1 tsp oil"],
      tip: "A splash of water helps them break down faster.",
    },
    {
      index: 4,
      title: "Season the sauce",
      instruction:
        "Add a pinch of sugar and salt. Taste — it should be slightly sweet and tangy.",
      ingredients: ["1 tsp sugar", "Salt to taste"],
    },
    {
      index: 5,
      title: "Combine eggs and tomatoes",
      instruction:
        "Return the eggs to the pan and fold through the tomato sauce.",
      durationSeconds: 60,
      ingredients: ["Cooked eggs"],
    },
    {
      index: 6,
      title: "Serve",
      instruction:
        "Spoon over hot rice and garnish with spring onion if you have it.",
      ingredients: ["Cooked rice", "Spring onion (optional)"],
    },
  ] satisfies CookingStep[],
};
