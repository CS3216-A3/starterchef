import type { Metadata } from "next";
import { RecipeCard } from "@/components/recipe-card";
import { mockRecipes } from "@/lib/mock-data";

export const metadata: Metadata = {
  title: "Saved recipes",
};

export default function RecipesPage() {
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mockRecipes.map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} />
        ))}
      </div>
    </div>
  );
}
