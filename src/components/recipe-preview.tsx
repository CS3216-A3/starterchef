"use client";

import { Clock, Sparkles, Users, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { StartCookingButton } from "@/components/cook-buttons";
import { RecipeImage } from "@/components/recipe-image";
import { iconMap, type RecipeCardModel } from "@/lib/recipe-view";
import { CookingPot } from "lucide-react";

/** Serializable subset of the card model — everything that crosses the
 *  server→client boundary must be plain data (no Lucide components). */
type RecipePreview = Omit<RecipeCardModel, "icon" | "imageTint">;

/**
 * "View recipe" opens a quick glance popup — the full page stays for the
 * committed cook flow. The modal carries just the card data; "Open full
 * recipe" is the escape hatch for ingredients and steps.
 */
export function RecipePreviewButton({ recipe }: { recipe: RecipePreview }) {
  const [open, setOpen] = useState(false);
  const href = `/recipes/${recipe.slug}`;
  const Icon = iconMap[recipe.iconName] ?? CookingPot;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border-2 border-espresso/10 px-3 py-2 text-sm font-bold text-espresso transition-colors hover:border-flame/50"
      >
        View recipe
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-espresso/40 p-4 sm:items-center"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={recipe.title}
        >
          <div
            className="flex w-full max-w-md flex-col gap-3 overflow-hidden rounded-3xl bg-card p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <div className="aspect-[16/9] overflow-hidden rounded-2xl">
                <RecipeImage
                  imageUrl={recipe.imageUrl}
                  title={recipe.title}
                  icon={Icon}
                />
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close preview"
                className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-card/90 text-espresso ring-1 ring-oat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <h3 className="text-lg leading-snug font-extrabold">
              {recipe.title}
            </h3>
            <p className="flex items-center gap-3 text-xs font-semibold text-espresso-light">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> {recipe.minutes} min
              </span>
              <span>·</span>
              <span>{recipe.difficultyLabel}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> Serves {recipe.servings}
              </span>
            </p>
            <p className="inline-flex items-center gap-1.5 text-xs font-bold text-flame">
              <Sparkles className="h-3.5 w-3.5" /> {recipe.whyGood}
            </p>
            <div className="mt-1 flex gap-2">
              <Link
                href={href}
                className="flex-1 rounded-xl border-2 border-espresso/10 px-3 py-2 text-center text-sm font-bold text-espresso transition-colors hover:border-flame/50"
              >
                Open full recipe
              </Link>
              <div className="flex-1">
                <StartCookingButton
                  recipeId={recipe.id}
                  slug={recipe.slug}
                  label="Let's cook"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
