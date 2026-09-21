"use client";

import { Bookmark } from "lucide-react";
import { useTransition } from "react";
import { toggleSavedRecipe } from "@/app/(app)/recipes/actions";
import { trackEvent } from "@/lib/posthog/events";
import { cn } from "@/lib/utils";

/**
 * Bookmark toggle on a recipe card. Optimistic-looking but simple: flips
 * server-side via toggleSavedRecipe and relies on revalidatePath.
 */
export function SaveRecipeButton({
  recipeId,
  saved,
}: {
  recipeId: string;
  saved: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      trackEvent(saved ? "recipe_unsaved" : "recipe_saved", {
        recipe_id: recipeId,
      });
      await toggleSavedRecipe(recipeId, !saved).catch(() => undefined);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved recipes" : "Save recipe"}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
        saved
          ? "bg-flame text-white hover:bg-flame-dark"
          : "bg-card/80 text-espresso-light ring-1 ring-oat hover:text-espresso",
      )}
    >
      <Bookmark
        className="h-4 w-4"
        fill={saved ? "currentColor" : "none"}
        strokeWidth={2.5}
      />
    </button>
  );
}
