"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  loadActiveRecipeDraft,
  type ActiveRecipeDraft,
} from "@/lib/active-recipe-draft";

export function ActiveRecipeDraftNotice() {
  const [draft, setDraft] = useState<ActiveRecipeDraft | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadActiveRecipeDraft()
      .then((active) => {
        if (!cancelled) setDraft(active);
      })
      .catch(() => {
        // The import page can retry discovery; the recipe list remains usable.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!draft) return null;

  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-card p-5 ring-1 ring-oat sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-lg font-extrabold">
          {draft.status === "awaiting_user_acceptance"
            ? "A recipe is ready for your review"
            : "You have a recipe review in progress"}
        </h2>
        <p className="mt-1 text-sm font-semibold text-espresso-light">
          Open it to check progress, accept the recipe, or cancel the review.
        </p>
      </div>
      <Link
        href={`/recipes/import?draft=${draft.draftId}`}
        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-flame px-6 font-bold text-white hover:bg-flame-dark"
      >
        Open review
      </Link>
    </section>
  );
}
