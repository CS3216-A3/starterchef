import Link from "next/link";
import type { Metadata } from "next";
import { RecipeCard } from "@/components/recipe-card";
import { getSavedRecipes } from "@/lib/data";
import { toRecipeCardModel } from "@/lib/recipe-view";

export const metadata: Metadata = {
  title: "Saved recipes",
};

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const recipes = await getSavedRecipes();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Saved recipes
        </h1>
        <p className="mt-1 font-semibold text-espresso-light">
          Your keepers — dishes you rated, remixed, or want to try again.
        </p>
      </div>

      {recipes.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-3xl bg-card p-6 ring-1 ring-oat">
          <p className="text-sm font-semibold text-espresso-light">
            Nothing saved yet. Browse tonight&apos;s ideas and tap the bookmark
            to keep a recipe here.
          </p>
          <Link
            href="/today"
            className="text-sm font-bold text-flame underline underline-offset-2 hover:text-flame-dark"
          >
            See today&apos;s ideas
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={toRecipeCardModel(recipe)}
              saved
            />
          ))}
        </div>
      )}
    </div>
  );
}
