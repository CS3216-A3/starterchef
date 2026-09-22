"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/posthog/events";

/** Invisible component that fires recipe_selected once when a recipe's detail page is viewed. */
export function RecipeViewTracker({
  recipeId,
  recipeSlug,
  isOwner,
}: {
  recipeId: string;
  recipeSlug: string;
  isOwner: boolean;
}) {
  useEffect(() => {
    trackEvent("recipe_selected", {
      recipe_id: recipeId,
      recipe_slug: recipeSlug,
      is_owner: isOwner,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per mount, not on every prop identity change
  }, [recipeId]);

  return null;
}
