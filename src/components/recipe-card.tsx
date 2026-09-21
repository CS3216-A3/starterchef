import { Clock, Sparkles, Users } from "lucide-react";
import { SaveRecipeButton } from "@/components/save-recipe-button";
import { StartCookingButton } from "@/components/cook-buttons";
import type { RecipeCardModel } from "@/lib/recipe-view";

export function RecipeCard({
  recipe,
  saved,
}: {
  recipe: RecipeCardModel & { primaryCta?: boolean };
  saved?: boolean;
}) {
  const Icon = recipe.icon;

  return (
    <article className="relative flex flex-col overflow-hidden rounded-3xl bg-card shadow-sm ring-1 ring-oat">
      <div
        className={`flex aspect-[16/9] items-center justify-center bg-gradient-to-br ${recipe.imageTint}`}
        aria-hidden="true"
      >
        <Icon className="h-12 w-12 text-espresso/30" strokeWidth={1.5} />
      </div>
      {saved !== undefined && (
        <div className="absolute top-3 right-3">
          <SaveRecipeButton recipeId={recipe.id} saved={saved} />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="text-lg leading-snug font-extrabold">{recipe.title}</h3>
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
        <div className="mt-auto pt-2">
          <StartCookingButton
            slug={recipe.slug}
            primary={recipe.primaryCta}
            label={recipe.primaryCta ? "Let's cook" : "View recipe"}
          />
        </div>
      </div>
    </article>
  );
}
