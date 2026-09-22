import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { RecipeCard } from "@/components/recipe-card";
import { getSavedRecipes, getUserRecipes } from "@/lib/data";
import { toRecipeCardModel } from "@/lib/recipe-view";

export const metadata: Metadata = {
  title: "My recipes",
};

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const [myRecipes, savedRecipes] = await Promise.all([
    getUserRecipes(),
    getSavedRecipes(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">My recipes</h1>
          <p className="mt-1 font-semibold text-espresso-light">
            Recipes you imported, personalised, or saved from the catalogue.
          </p>
        </div>
        <Link
          href="/recipes/import"
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-flame px-4 py-2 text-sm font-bold text-white hover:bg-flame-dark"
        >
          <Plus className="h-4 w-4" /> Import
        </Link>
      </div>

      {myRecipes.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-3xl bg-card p-6 ring-1 ring-oat">
          <p className="text-sm font-semibold text-espresso-light">
            No recipes yet. Import one from a link, a photo, or pasted text.
          </p>
          <Link
            href="/recipes/import"
            className="text-sm font-bold text-flame underline underline-offset-2 hover:text-flame-dark"
          >
            Import your first recipe
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {myRecipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={toRecipeCardModel(recipe)}
              editHref={`/recipes/${recipe.id}/edit`}
            />
          ))}
        </div>
      )}

      {savedRecipes.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-extrabold">Saved from catalogue</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {savedRecipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={toRecipeCardModel(recipe)}
                saved
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
