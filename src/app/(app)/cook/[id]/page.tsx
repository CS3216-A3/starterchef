import { ArrowLeft, ArrowRight, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { CookAssist } from "@/components/cook-assist";
import { StepPhoto } from "@/components/step-photo";
import { StepTracker } from "@/components/step-tracker";
import { getActiveCookingSession, getRecipeBySlug } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function CookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { id } = await params;
  const { step } = await searchParams;

  // [id] is the recipe slug (e.g. "tomato-egg-stir-fry").
  const [recipe, session] = await Promise.all([
    getRecipeBySlug(id),
    getActiveCookingSession(),
  ]);
  if (!recipe || (recipe.steps ?? []).length === 0) notFound();

  const recipeTitle = recipe.title;
  // Checkpoint photos taken in this session live on the session snapshot for
  // catalogue recipes — merge them over the base steps.
  const sessionSteps =
    session?.recipe?.slug === recipe.slug ? session.recipe.steps : undefined;
  const sessionPhotos = new Map(
    (sessionSteps ?? [])
      .filter((s) => s.photoUrl)
      .map((s) => [s.index, s.photoUrl] as const),
  );
  const steps = (recipe.steps ?? []).map((s) =>
    sessionPhotos.has(s.index)
      ? { ...s, photoUrl: sessionPhotos.get(s.index) }
      : s,
  );
  const stepIndex = Math.min(Math.max(Number(step ?? 1) || 1, 1), steps.length);
  const current = steps[stepIndex - 1];
  // Only log to the session actually cooking this recipe.
  const sessionId =
    session?.recipe?.slug === recipe.slug ? session.id : undefined;
  const progress = Math.round((stepIndex / steps.length) * 100);

  // No ?step → mise en place: the cook gathers ingredients and equipment
  // before the first instruction, instead of being dropped into step 1.
  if (!step) {
    // Seeded/imported rows can have nulls despite the string[] type.
    const allIngredients = recipe.ingredients ?? [];
    const allEquipment = recipe.equipment ?? [];
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-6">
        <BackButton />
        <header className="flex flex-col gap-1">
          <p className="text-xs font-bold tracking-wide text-espresso-light uppercase">
            {recipeTitle}
          </p>
          <h1 className="text-2xl font-extrabold">Get everything ready</h1>
          <p className="text-sm font-semibold text-espresso-light">
            {recipe.minutes} min · {recipe.difficulty} · serves{" "}
            {recipe.servings} · {steps.length} steps
          </p>
          {recipe.description ? (
            <p className="text-sm font-semibold text-espresso-light">
              {recipe.description}
            </p>
          ) : null}
        </header>

        <section className="flex flex-col gap-2 rounded-3xl bg-card p-4 shadow-sm ring-1 ring-oat">
          <h2 className="text-xs font-extrabold tracking-wide text-espresso-light uppercase">
            Ingredients
          </h2>
          <ul className="flex flex-wrap gap-2">
            {allIngredients.map((item) => (
              <li
                key={item}
                className="rounded-full bg-oat px-3 py-1.5 text-sm font-bold"
              >
                {item}
              </li>
            ))}
          </ul>
        </section>

        {allEquipment.length > 0 ? (
          <section className="flex flex-col gap-2 rounded-3xl bg-card p-4 shadow-sm ring-1 ring-oat">
            <h2 className="text-xs font-extrabold tracking-wide text-espresso-light uppercase">
              Equipment
            </h2>
            <ul className="flex flex-wrap gap-2">
              {allEquipment.map((item) => (
                <li
                  key={item}
                  className="rounded-full bg-oat px-3 py-1.5 text-sm font-bold"
                >
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="flex flex-col gap-2 rounded-3xl bg-card p-4 shadow-sm ring-1 ring-oat">
          <h2 className="text-xs font-extrabold tracking-wide text-espresso-light uppercase">
            The plan
          </h2>
          <ol className="flex flex-col gap-1.5">
            {steps.map((s) => (
              <li key={s.index} className="flex gap-2.5 text-sm font-semibold">
                <span className="w-5 shrink-0 text-right font-extrabold text-flame">
                  {s.index}
                </span>
                <span className="text-espresso-light">{s.title}</span>
              </li>
            ))}
          </ol>
        </section>

        <div className="flex flex-col gap-2">
          <Link href={`/cook/${id}?step=1`} className="self-stretch">
            <Button size="md" className="w-full">
              Start cooking <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          {recipe.user_id ? (
            <Link href={`/recipes/${recipe.id}/edit`} className="self-stretch">
              <Button variant="outline" size="md" className="w-full">
                <Pencil className="h-4 w-4" /> Customise this recipe first
              </Button>
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      {sessionId && <StepTracker sessionId={sessionId} stepIndex={stepIndex} />}
      <header className="flex flex-col gap-2">
        <p className="text-xs font-bold tracking-wide text-espresso-light uppercase">
          {recipeTitle}
        </p>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold">
            Step {stepIndex} of {steps.length}
          </h1>
          <span className="text-sm font-extrabold text-flame">{progress}%</span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-oat"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-flame transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-extrabold">{current.title}</h2>
        <p className="leading-relaxed font-semibold text-espresso-light">
          {current.instruction}
        </p>
        {current.photoUrl ? (
          <StepPhoto
            recipeSlug={recipe.slug}
            stepIndex={current.index}
            photoUrl={current.photoUrl}
          />
        ) : null}
        {current.photoCheckpoint ? (
          <p className="text-xs font-semibold text-espresso-light">
            What it should look like: {current.photoCheckpoint}
          </p>
        ) : null}
        {current.tip ? (
          <p className="rounded-2xl bg-flame-soft p-3 text-sm font-semibold">
            Tip: {current.tip}
          </p>
        ) : null}
      </section>

      {(current.ingredients ?? []).length > 0 ? (
        <section className="rounded-3xl bg-oat p-4">
          <h3 className="mb-2 text-xs font-extrabold tracking-wide text-espresso-light uppercase">
            For this step
          </h3>
          <ul className="flex flex-wrap gap-2">
            {(current.ingredients ?? []).map((item) => (
              <li
                key={item}
                className="rounded-full bg-card px-3 py-1.5 text-sm font-bold"
              >
                {item}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <CookAssist
        context={{
          recipeTitle,
          stepTitle: current.title,
          instruction: current.instruction,
          photoCheckpoint: current.photoCheckpoint,
          recipeId: recipe.id,
          recipeSlug: recipe.slug,
        }}
        sessionId={sessionId}
        stepIndex={stepIndex}
        cookUrl={`/cook/${id}`}
        totalSteps={steps.length}
        durationSeconds={current.durationSeconds}
      />

      <nav className="flex items-center justify-between gap-3">
        {stepIndex > 1 ? (
          <Link href={`/cook/${id}?step=${stepIndex - 1}`}>
            <Button variant="outline" size="md">
              <ArrowLeft className="h-4 w-4" /> Previous
            </Button>
          </Link>
        ) : (
          <Link href={`/cook/${id}`}>
            <Button variant="outline" size="md">
              <ArrowLeft className="h-4 w-4" /> Prep list
            </Button>
          </Link>
        )}
        {stepIndex < steps.length ? (
          <Link href={`/cook/${id}?step=${stepIndex + 1}`}>
            <Button size="md">
              Done, next step <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        ) : (
          <Link href={`/cook/${id}/finish`}>
            <Button size="md">
              Finish cooking <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        )}
      </nav>
    </div>
  );
}
