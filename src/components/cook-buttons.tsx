"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/button";
import {
  completeCookingSession,
  startCookingSession,
} from "@/app/(app)/cook/[id]/actions";
import { saveRecipeFeedback } from "@/app/(app)/recipes/actions";
import { trackEvent } from "@/lib/posthog/events";
import type { ImportedRecipe } from "@/lib/ai/schemas/import";
import type { RecipeRow } from "@/lib/types";

/**
 * "Let's cook" / "View recipe" CTA. Creates (or reuses) an in-progress
 * cooking_sessions row, then navigates to the cook screen. If the insert
 * fails we still navigate so the UI never dead-ends.
 */
export function StartCookingButton({
  slug,
  primary,
  label,
}: {
  slug: string;
  primary?: boolean;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      trackEvent("cooking_session_started", { recipe_slug: slug });
      await startCookingSession(slug).catch(() => undefined);
      router.push(`/cook/${slug}`);
    });
  }

  return (
    <Button
      variant={primary ? "primary" : "outline"}
      size="sm"
      className="w-full"
      disabled={pending}
      onClick={handleClick}
    >
      {pending ? "Starting…" : label}
    </Button>
  );
}

/** "Finish cooking" on the last step — collects feedback before closing. */
export function FinishCookingButton({ recipe }: { recipe: RecipeRow }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);

  if (!showForm) {
    return (
      <Button size="md" onClick={() => setShowForm(true)}>
        Finish cooking
        <ArrowRight className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <CookingFeedbackForm
      recipe={recipe}
      onDone={() => router.push("/today")}
      onCancel={() => setShowForm(false)}
    />
  );
}

function CookingFeedbackForm({
  recipe,
  onDone,
  onCancel,
}: {
  recipe: RecipeRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [rating, setRating] = useState<string>("");
  const [substitutions, setSubstitutions] = useState("");
  const [equipment, setEquipment] = useState("");
  const [scaledServings, setScaledServings] = useState("");
  const [notes, setNotes] = useState("");
  const [wouldCookAgain, setWouldCookAgain] = useState<boolean | null>(null);
  const [savePersonalized, setSavePersonalized] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const substitutionsMade = substitutions
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const equipmentAdjusted = equipment
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const personalizedCopy = savePersonalized
        ? buildPersonalizedRecipe(recipe, {
            scaledServings: scaledServings ? Number(scaledServings) : undefined,
            substitutions,
            notes,
          })
        : undefined;

      const result = await saveRecipeFeedback(
        {
          recipeId: recipe.id,
          rating: rating ? Number(rating) : undefined,
          substitutionsMade,
          equipmentAdjusted,
          scaledServings: scaledServings ? Number(scaledServings) : undefined,
          wouldCookAgain: wouldCookAgain ?? undefined,
          notes,
        },
        personalizedCopy
          ? { createPersonalizedCopy: personalizedCopy }
          : undefined,
      );

      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }

      trackEvent("cooking_session_completed", {
        recipe_id: recipe.id,
        would_cook_again: wouldCookAgain,
      });
      await completeCookingSession().catch(() => undefined);
      onDone();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full flex-col gap-4 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-oat"
    >
      <h3 className="text-lg font-extrabold">How did it go?</h3>

      <label className="flex flex-col gap-1 text-sm font-bold">
        Rating (1–5)
        <select
          value={rating}
          onChange={(e) => setRating(e.target.value)}
          className="rounded-xl border-2 border-espresso/10 bg-oat p-2 text-sm font-semibold outline-none focus:border-flame"
        >
          <option value="">Skip</option>
          <option value="1">1 · Would not make again</option>
          <option value="2">2</option>
          <option value="3">3 · Okay</option>
          <option value="4">4</option>
          <option value="5">5 · Loved it</option>
        </select>
      </label>

      <div className="flex flex-col gap-1 text-sm font-bold">
        Would you cook this again?
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setWouldCookAgain(true)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
              wouldCookAgain === true
                ? "bg-flame text-white"
                : "bg-oat text-espresso-light hover:bg-oat-dark"
            }`}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => setWouldCookAgain(false)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
              wouldCookAgain === false
                ? "bg-flame text-white"
                : "bg-oat text-espresso-light hover:bg-oat-dark"
            }`}
          >
            No
          </button>
        </div>
      </div>

      <label className="flex flex-col gap-1 text-sm font-bold">
        Substitutions (comma separated)
        <input
          value={substitutions}
          onChange={(e) => setSubstitutions(e.target.value)}
          placeholder="e.g. honey instead of sugar, oat milk"
          className="rounded-xl border-2 border-espresso/10 bg-oat p-2 text-sm font-semibold outline-none focus:border-flame"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-bold">
        Equipment work-arounds (comma separated)
        <input
          value={equipment}
          onChange={(e) => setEquipment(e.target.value)}
          placeholder="e.g. used a frying pan instead of a wok"
          className="rounded-xl border-2 border-espresso/10 bg-oat p-2 text-sm font-semibold outline-none focus:border-flame"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-bold">
        How many people did you serve?
        <input
          type="number"
          value={scaledServings}
          onChange={(e) => setScaledServings(e.target.value)}
          placeholder={String(recipe.servings)}
          className="rounded-xl border-2 border-espresso/10 bg-oat p-2 text-sm font-semibold outline-none focus:border-flame"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-bold">
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything to remember next time?"
          rows={3}
          className="rounded-xl border-2 border-espresso/10 bg-oat p-2 text-sm font-semibold outline-none focus:border-flame"
        />
      </label>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            checked={savePersonalized}
            onChange={(e) => setSavePersonalized(e.target.checked)}
            className="h-4 w-4"
          />
          Save a personalised copy to my recipes
        </label>

        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Done"}
          </Button>
        </div>
      </div>

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
  changes: {
    scaledServings?: number;
    substitutions?: string;
    notes?: string;
  },
): ImportedRecipe {
  const servings = changes.scaledServings ?? recipe.servings;
  const notes = changes.notes?.trim();
  const description = notes
    ? `${recipe.description} (personalised: ${notes})`
    : recipe.description;

  return {
    title: `My ${recipe.title}`,
    description,
    minutes: recipe.minutes,
    difficulty: recipe.difficulty,
    servings,
    ingredients: recipe.ingredients,
    equipment: recipe.equipment,
    steps: recipe.steps.map((step) => ({
      index: step.index,
      title: step.title,
      instruction: step.instruction,
      durationSeconds: step.durationSeconds,
      ingredientsUsed: step.ingredients,
      tip: step.tip,
    })),
    tags: [...recipe.tags, "personalised"],
    whyGood: recipe.why_good,
  };
}
