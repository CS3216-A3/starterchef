"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/button";
import { completeCookingSession } from "@/app/(app)/cook/[id]/actions";
import { saveRecipeFeedback } from "@/app/(app)/recipes/actions";
import { trackEvent } from "@/lib/posthog/events";
import type { ImportedRecipe } from "@/lib/ai/schemas/import";
import type { RecipeRow } from "@/lib/types";

const RATING_LABELS = [
  "Would not make again",
  "Not great",
  "Okay",
  "Good",
  "Loved it",
];

/** End-of-cook feedback on its own page: rate it, jot notes, and choose
 *  whether to keep a personalised copy. */
export function FinishForm({ recipe }: { recipe: RecipeRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rating, setRating] = useState(3);
  const [notes, setNotes] = useState("");
  const [savePersonalized, setSavePersonalized] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveRecipeFeedback(
        {
          recipeId: recipe.id,
          rating,
          // The rating says it: 4-5 means they'd cook it again, 1-2 means no.
          wouldCookAgain: rating >= 4 ? true : rating <= 2 ? false : undefined,
          notes,
        },
        savePersonalized
          ? { createPersonalizedCopy: buildPersonalizedRecipe(recipe, notes) }
          : undefined,
      );

      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }

      trackEvent("feedback_submitted", {
        recipe_id: recipe.id,
        rating,
        personalized_copy: savePersonalized,
      });

      const completion = await completeCookingSession().catch(() => null);

      if (!completion || ("error" in completion && completion.error)) {
        setError(
          "Your feedback was saved, but we could not finish the session.",
        );
        return;
      }

      trackEvent("cooking_session_completed", {
        recipe_id: recipe.id,
        rating,
      });

      router.push("/today");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Recipe preview */}
      <div className="flex items-center gap-3 rounded-3xl bg-card p-3 shadow-sm ring-1 ring-oat">
        {recipe.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={recipe.image_url}
            alt={recipe.title}
            className="h-16 w-16 rounded-2xl object-cover"
          />
        ) : null}
        <div className="flex flex-col">
          <p className="text-base font-extrabold">{recipe.title}</p>
          <p className="text-xs font-semibold text-espresso-light">
            {recipe.minutes} min · {recipe.difficulty} · serves{" "}
            {recipe.servings}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label htmlFor="rating" className="text-sm font-extrabold">
            Rating
          </label>
          <span className="text-sm font-extrabold text-flame">
            {rating}/5 · {RATING_LABELS[rating - 1]}
          </span>
        </div>
        <input
          id="rating"
          type="range"
          min={1}
          max={5}
          step={1}
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
          className="w-full accent-flame"
        />
        <div className="flex justify-between text-xs font-bold text-espresso-light">
          <span>1</span>
          <span>5</span>
        </div>
      </div>

      <label className="flex flex-col gap-1 text-sm font-extrabold">
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything to remember next time?"
          rows={3}
          className="rounded-xl border-2 border-espresso/10 bg-card p-2.5 text-sm font-semibold outline-none focus:border-flame"
        />
      </label>

      <label className="flex items-center gap-2 text-sm font-bold">
        <input
          type="checkbox"
          checked={savePersonalized}
          onChange={(e) => setSavePersonalized(e.target.checked)}
          className="h-4 w-4 accent-flame"
        />
        Save a personalised copy to my recipes
      </label>

      <Button type="submit" size="md" disabled={pending}>
        {pending ? "Saving…" : "Done"}
      </Button>

      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}

function buildPersonalizedRecipe(
  recipe: RecipeRow,
  notes: string,
): ImportedRecipe {
  const trimmed = notes.trim();
  return {
    title: `My ${recipe.title}`,
    description: trimmed
      ? `${recipe.description} (personalised: ${trimmed})`
      : recipe.description,
    minutes: recipe.minutes,
    difficulty: recipe.difficulty,
    servings: recipe.servings,
    ingredients: recipe.ingredients,
    equipment: recipe.equipment,
    steps: recipe.steps.map((step) => ({
      index: step.index,
      title: step.title,
      instruction: step.instruction,
      durationSeconds: step.durationSeconds,
      ingredientsUsed: step.ingredients,
      tip: step.tip,
      photoCheckpoint: step.photoCheckpoint,
    })),
    tags: [...recipe.tags, "personalised"],
    whyGood: recipe.why_good,
  };
}
