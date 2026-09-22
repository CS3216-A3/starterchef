import { ArrowRight, Flame, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { FilterPills } from "@/components/filter-pills";
import { KitchenPanel } from "@/components/kitchen-panel";
import { RecipeCard } from "@/components/recipe-card";
import { redirect } from "next/navigation";
import {
  getActiveCookingSession,
  getKitchenItems,
  getProfile,
  getRecipes,
  getUserRecipes,
} from "@/lib/data";
import { toRecipeCardModel } from "@/lib/recipe-view";

export const metadata: Metadata = {
  title: "Today",
};

// Reads Supabase per-request — never prerender (also keeps builds working
// when env vars aren't set).
export const dynamic = "force-dynamic";

const skillToDifficulty: Record<string, string> = {
  beginner: "easy",
  intermediate: "medium",
  advanced: "hard",
};

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ time?: string; servings?: string; skill?: string }>;
}) {
  const { time, servings, skill } = await searchParams;
  const [allRecipes, myRecipes, kitchenItems, session, profile] =
    await Promise.all([
      getRecipes(),
      getUserRecipes(),
      getKitchenItems(),
      getActiveCookingSession(),
      getProfile(),
    ]);

  // First-run users go through the onboarding wizard before landing here.
  // A missing profile row means they never onboarded, so treat it the same.
  if (!profile?.onboarded_at) redirect("/onboarding");

  const ingredients = kitchenItems.filter((i) => i.kind === "ingredient");
  const equipment = kitchenItems.filter((i) => i.kind === "equipment");
  const activeRecipe = session?.recipe;

  // Apply the filter pills (?time=&servings=&skill=). When the user hasn't
  // chosen a value, fall back to their profile (household size, skill).
  const effectiveServings = servings ?? profile?.household_size?.toString();
  const effectiveSkill = skill ?? profile?.skill_level;
  const maxMinutes = time ? Number(time) : undefined;
  const minServings = effectiveServings ? Number(effectiveServings) : undefined;
  const difficulty = effectiveSkill
    ? skillToDifficulty[effectiveSkill]
    : undefined;
  const hasFilters = Boolean(time || servings || skill);
  const recipes = allRecipes
    .filter(
      (r) =>
        (!maxMinutes || r.minutes <= maxMinutes) &&
        (!minServings || r.servings >= minServings) &&
        (!difficulty || r.difficulty === difficulty),
    )
    .slice(0, 4);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            What can we cook today?
          </h1>
          <p className="mt-1 text-lg font-semibold text-espresso-light">
            Good food starts with what you have.
          </p>
        </div>
        <Suspense fallback={null}>
          <FilterPills
            defaultServings={effectiveServings}
            defaultSkill={effectiveSkill}
          />
        </Suspense>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="flex flex-col gap-4">
          {activeRecipe?.slug && (
            <Link
              href={`/cook/${activeRecipe.slug}?step=${session?.current_step ?? 1}`}
              className="flex items-center justify-between rounded-3xl border-2 border-flame bg-flame-soft p-5 transition-colors hover:bg-[#fcd9b8]"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-card">
                  <Flame className="h-5 w-5 text-flame" />
                </span>
                <span>
                  <span className="block text-sm font-extrabold">
                    Already cooking
                  </span>
                  <span className="block text-xs font-semibold text-espresso-light">
                    Continue {activeRecipe.title ?? "your recipe"} from step{" "}
                    {session?.current_step ?? 1}
                  </span>
                </span>
              </span>
              <ArrowRight className="h-5 w-5 text-espresso-light" />
            </Link>
          )}

          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold">Your recipes</h2>
            <Link
              href="/recipes/import"
              className="inline-flex items-center gap-1 text-sm font-bold text-flame hover:text-flame-dark"
            >
              <Plus className="h-4 w-4" /> Import recipe
            </Link>
          </div>

          {myRecipes.length === 0 ? (
            <div className="rounded-3xl bg-card p-5 ring-1 ring-oat">
              <p className="text-sm font-semibold text-espresso-light">
                You have not imported any recipes yet. Import one from a link,
                photo or pasted text.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {myRecipes.slice(0, 2).map((recipe) => (
                <RecipeCard
                  key={recipe.id}
                  recipe={toRecipeCardModel(recipe)}
                />
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold">
              {recipes.length > 0
                ? "A few ideas for tonight"
                : "No catalogue recipes"}
            </h2>
            <Link
              href="/recipes/browse"
              className="inline-flex items-center gap-1 text-sm font-bold text-espresso-light hover:text-espresso"
            >
              See more recipes <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {recipes.length === 0 ? (
            <p className="text-sm font-semibold text-espresso-light">
              {hasFilters ? (
                <>
                  Nothing matches those filters.{" "}
                  <Link
                    href="/today"
                    className="font-bold text-flame underline"
                  >
                    Reset filters
                  </Link>
                </>
              ) : (
                "Add ingredients or import recipes to see suggestions here."
              )}
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {recipes.map((recipe, i) => (
                <RecipeCard
                  key={recipe.id}
                  recipe={toRecipeCardModel(recipe, { primaryCta: i === 0 })}
                />
              ))}
            </div>
          )}
        </section>

        <KitchenPanel ingredients={ingredients} equipment={equipment} />
      </div>
    </div>
  );
}
