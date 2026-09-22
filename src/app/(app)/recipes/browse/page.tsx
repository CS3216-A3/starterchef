import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RecipeCard } from "@/components/recipe-card";
import { getRecipes, getSavedRecipeIds } from "@/lib/data";
import { toRecipeCardModel } from "@/lib/recipe-view";

export const metadata: Metadata = {
  title: "Browse recipes",
};

export const dynamic = "force-dynamic";

/** The full shared catalogue — distinct from "My recipes" (the user's own
 *  imported/personalised library). */
export default async function BrowseRecipesPage() {
  const [recipes, savedIds] = await Promise.all([
    getRecipes(),
    getSavedRecipeIds(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/today"
          className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-espresso-light hover:text-espresso"
        >
          <ArrowLeft className="h-4 w-4" /> Back to today
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Recipe catalogue
        </h1>
        <p className="mt-1 font-semibold text-espresso-light">
          Beginner-friendly ideas from the StarterChef catalogue. Save the ones
          you like, or import your own.
        </p>
      </div>

      {recipes.length === 0 ? (
        <p className="text-sm font-semibold text-espresso-light">
          The catalogue is empty right now. Try importing a recipe instead.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={toRecipeCardModel(recipe)}
              saved={savedIds.has(recipe.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
