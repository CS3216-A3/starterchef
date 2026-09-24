import { Clock, Pencil, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { SaveRecipeButton } from "@/components/save-recipe-button";
import { StartCookingButton } from "@/components/cook-buttons";
import { RecipeImage } from "@/components/recipe-image";
import { RecipePreviewButton } from "@/components/recipe-preview";
import type { RecipeCardModel } from "@/lib/recipe-view";

export function RecipeCard({
  recipe,
  saved,
  editHref,
}: {
  recipe: RecipeCardModel & { primaryCta?: boolean };
  saved?: boolean;
  editHref?: string;
}) {
  const href = `/recipes/${recipe.slug}`;

  return (
    <article className="relative flex flex-col overflow-hidden rounded-3xl bg-card shadow-sm ring-1 ring-oat">
      <Link href={href} className="relative block aspect-[16/9]">
        <RecipeImage
          imageUrl={recipe.imageUrl}
          title={recipe.title}
          icon={recipe.icon}
        />
      </Link>
      {editHref && (
        <Link
          href={editHref}
          className="absolute top-3 left-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-card/80 text-espresso-light ring-1 ring-oat transition-colors hover:bg-oat hover:text-espresso"
          aria-label="Edit recipe"
        >
          <Pencil className="h-4 w-4" />
        </Link>
      )}
      {saved !== undefined && (
        <div className="absolute top-3 right-3 z-10">
          <SaveRecipeButton recipeId={recipe.id} saved={saved} />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="text-lg leading-snug font-extrabold">
          <Link href={href} className="hover:text-flame">
            {recipe.title}
          </Link>
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
        <div className="mt-auto flex gap-2 pt-2">
          <div className="flex-1">
            <RecipePreviewButton
              recipe={{
                id: recipe.id,
                slug: recipe.slug,
                title: recipe.title,
                minutes: recipe.minutes,
                difficultyLabel: recipe.difficultyLabel,
                servings: recipe.servings,
                whyGood: recipe.whyGood,
                iconName: recipe.iconName,
                imageUrl: recipe.imageUrl,
                ingredients: recipe.ingredients,
                steps: recipe.steps,
              }}
            />
          </div>
          <div className="flex-1">
            <StartCookingButton
              recipeId={recipe.id}
              slug={recipe.slug}
              primary={recipe.primaryCta}
              label="Let's cook"
            />
          </div>
        </div>
      </div>
    </article>
  );
}
