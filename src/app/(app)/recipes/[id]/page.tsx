import {
  Clock,
  ExternalLink,
  History,
  Pencil,
  Timer,
  Users,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/button";
import { StartCookingButton } from "@/components/cook-buttons";
import { DeleteRecipeButton } from "@/components/delete-recipe-button";
import { RecipeChat } from "@/components/recipe-chat";
import { RecipeImage } from "@/components/recipe-image";
import { RecipeViewTracker } from "@/components/recipe-view-tracker";
import { SaveRecipeButton } from "@/components/save-recipe-button";
import { getRecipeBySlug, getSavedRecipeIds, getUser } from "@/lib/data";
import { iconMap } from "@/lib/recipe-view";
import { getSessionsForRecipe } from "@/lib/session-events";

export const dynamic = "force-dynamic";

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function sourceDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default async function RecipeOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [recipe, user, savedIds] = await Promise.all([
    getRecipeBySlug(id),
    getUser(),
    getSavedRecipeIds(),
  ]);
  if (!recipe) notFound();

  const sessions = (await getSessionsForRecipe(recipe.id, recipe.slug)).filter(
    (s) => s.status !== "in_progress",
  );

  const isOwner = Boolean(user && recipe.user_id === user.id);
  const Icon = iconMap[recipe.icon];
  const difficultyLabel =
    recipe.difficulty.charAt(0).toUpperCase() + recipe.difficulty.slice(1);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <RecipeViewTracker
        recipeId={recipe.id}
        recipeSlug={recipe.slug}
        isOwner={isOwner}
      />
      {/* Hero */}
      <div className="relative aspect-[16/9] overflow-hidden rounded-3xl">
        <RecipeImage
          imageUrl={recipe.image_url}
          title={recipe.title}
          icon={Icon ?? undefined}
          iconClassName="h-16 w-16"
        />
      </div>

      {/* Title + meta */}
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">
            {recipe.title}
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            {!isOwner && recipe.user_id === null && (
              <SaveRecipeButton
                recipeId={recipe.id}
                saved={savedIds.has(recipe.id)}
              />
            )}
            {isOwner && (
              <Link
                href={`/recipes/${recipe.id}/edit`}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-espresso-light ring-1 ring-oat transition-colors hover:bg-oat hover:text-espresso"
                aria-label="Edit recipe"
              >
                <Pencil className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
        <p className="flex items-center gap-3 text-sm font-semibold text-espresso-light">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-4 w-4" /> {recipe.minutes} min
          </span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-4 w-4" /> {recipe.servings} servings
          </span>
          <span>·</span>
          <span>{difficultyLabel}</span>
        </p>
        {recipe.description && (
          <p className="font-semibold text-espresso-light">
            {recipe.description}
          </p>
        )}
        {recipe.source_url && (
          <a
            href={recipe.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-bold text-flame underline underline-offset-2 hover:text-flame-dark"
          >
            Recipe from {sourceDomain(recipe.source_url)}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      <StartCookingButton recipeId={recipe.id} primary label="Start cooking" />

      {/* Ingredients */}
      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-extrabold tracking-wide text-espresso-light uppercase">
          Ingredients
        </h2>
        <ul className="flex flex-wrap gap-2">
          {recipe.ingredients.map((ing, index) => (
            <li
              key={`${index}:${ing}`}
              className="rounded-full bg-card px-3 py-1.5 text-sm font-bold ring-1 ring-oat"
            >
              {ing}
            </li>
          ))}
        </ul>
      </section>

      {recipe.equipment.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-extrabold tracking-wide text-espresso-light uppercase">
            Equipment
          </h2>
          <ul className="flex flex-wrap gap-2">
            {recipe.equipment.map((item, index) => (
              <li
                key={`${index}:${item}`}
                className="rounded-full bg-oat px-3 py-1.5 text-sm font-bold"
              >
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Steps */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-extrabold tracking-wide text-espresso-light uppercase">
          Steps
        </h2>
        <ol className="flex flex-col gap-3">
          {recipe.steps.map((step) => (
            <li
              key={step.index}
              className="flex gap-3 rounded-3xl bg-card p-4 ring-1 ring-oat"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-flame text-sm font-extrabold text-white">
                {step.index}
              </span>
              <div className="flex flex-col gap-1">
                <p className="font-extrabold">
                  {step.title}
                  {step.durationSeconds ? (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs font-bold text-espresso-light">
                      <Timer className="h-3.5 w-3.5" />
                      {formatDuration(step.durationSeconds)}
                    </span>
                  ) : null}
                </p>
                <p className="text-sm font-semibold text-espresso-light">
                  {step.instruction}
                </p>
                {step.tip && (
                  <p className="text-xs font-bold text-flame">
                    Tip: {step.tip}
                  </p>
                )}
                {step.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- user-uploaded
                  <img
                    src={step.photoUrl}
                    alt={`Your photo of step ${step.index}`}
                    className="mt-1 h-20 w-28 rounded-xl object-cover ring-1 ring-oat"
                  />
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {sessions.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-xs font-extrabold tracking-wide text-espresso-light uppercase">
            <History className="h-4 w-4" /> Your cooking history
          </h2>
          <ul className="flex flex-col gap-3">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/sessions/${s.id}`}
                  className="block rounded-3xl bg-card p-4 ring-1 ring-oat transition-shadow hover:shadow-sm"
                >
                  <p className="text-sm font-extrabold">
                    {new Date(s.started_at).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {s.status === "abandoned" && (
                      <span className="ml-2 text-xs font-bold text-espresso-light">
                        abandoned
                      </span>
                    )}
                  </p>
                  {s.summary ? (
                    <>
                      <p className="mt-1 text-sm font-semibold text-espresso-light">
                        {s.summary.summary}
                      </p>
                      {s.summary.insights.length > 0 && (
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {s.summary.insights.map((insight) => (
                            <li
                              key={insight}
                              className="rounded-full bg-flame-soft px-3 py-1 text-xs font-bold"
                            >
                              {insight}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <p className="mt-1 text-sm font-semibold text-espresso-light">
                      Tap to see what happened in this session.
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <RecipeChat recipeId={recipe.id} />

      {isOwner && (
        <DeleteRecipeButton recipeId={recipe.id} recipeTitle={recipe.title} />
      )}

      <div>
        <Link href="/recipes">
          <Button variant="outline" size="sm">
            Back to my recipes
          </Button>
        </Link>
      </div>
    </div>
  );
}
