import {
  CookingPot,
  Drumstick,
  Egg,
  Salad,
  UtensilsCrossed,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import type { RecipeDifficulty, RecipeRow } from "@/lib/types";

/**
 * Maps a `recipes` row to the props RecipeCard needs. The DB stores the icon
 * as a Lucide name and the difficulty lowercase; the card wants a component
 * and a display label.
 */

export const iconMap: Record<string, LucideIcon> = {
  "cooking-pot": CookingPot,
  "utensils-crossed": UtensilsCrossed,
  wheat: Wheat,
  egg: Egg,
  salad: Salad,
  drumstick: Drumstick,
};

const difficultyLabels: Record<RecipeDifficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export interface RecipeCardModel {
  id: string;
  slug: string;
  title: string;
  minutes: number;
  difficultyLabel: string;
  servings: number;
  whyGood: string;
  icon: LucideIcon;
  imageTint: string;
  imageUrl: string | null;
}

export function toRecipeCardModel(
  recipe: RecipeRow,
  opts?: { primaryCta?: boolean },
): RecipeCardModel & { primaryCta: boolean } {
  return {
    id: recipe.id,
    slug: recipe.slug,
    title: recipe.title,
    minutes: recipe.minutes,
    difficultyLabel: difficultyLabels[recipe.difficulty] ?? "Easy",
    servings: recipe.servings,
    whyGood: recipe.why_good,
    icon: iconMap[recipe.icon] ?? CookingPot,
    imageTint: recipe.image_tint,
    imageUrl: recipe.image_url,
    primaryCta: opts?.primaryCta ?? false,
  };
}
