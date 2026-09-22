import { ArrowLeft, ArrowRight, Play, Timer } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VoiceAssistantButton } from "@/components/voice-assistant-button";
import { Button } from "@/components/button";
import { FinishCookingButton } from "@/components/cook-buttons";
import { StepPhotoUpload } from "@/components/step-photo-upload";
import { StepAskBox, StepCheckButton } from "@/components/step-assist";
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
  if (!recipe || recipe.steps.length === 0) notFound();

  const recipeTitle = recipe.title;
  // Step photos taken during this session live on the session snapshot for
  // catalogue recipes — merge them over the base steps.
  const sessionSteps =
    session?.recipe?.slug === recipe.slug ? session.recipe.steps : undefined;
  const sessionPhotos = new Map(
    (sessionSteps ?? [])
      .filter((s) => s.photoUrl)
      .map((s) => [s.index, s.photoUrl] as const),
  );
  const steps = recipe.steps.map((s) =>
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

  function formatDuration(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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

      <div className="flex flex-col gap-1">
        <StepPhotoUpload
          recipeId={recipe.id}
          recipeSlug={recipe.slug}
          stepIndex={current.index}
          initialPhotoUrl={current.photoUrl}
        />
        {current.photoCheckpoint ? (
          <p className="text-xs font-semibold text-espresso-light">
            What it should look like: {current.photoCheckpoint}
          </p>
        ) : null}
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-extrabold">{current.title}</h2>
        <p className="leading-relaxed font-semibold text-espresso-light">
          {current.instruction}
        </p>
        {current.tip ? (
          <p className="rounded-2xl bg-flame-soft p-3 text-sm font-semibold">
            Tip: {current.tip}
          </p>
        ) : null}
      </section>

      {current.ingredients.length > 0 ? (
        <section className="rounded-3xl bg-oat p-4">
          <h3 className="mb-2 text-xs font-extrabold tracking-wide text-espresso-light uppercase">
            For this step
          </h3>
          <ul className="flex flex-wrap gap-2">
            {current.ingredients.map((item) => (
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

      {current.durationSeconds ? (
        <div className="flex items-center justify-between rounded-3xl bg-card p-4 shadow-sm ring-1 ring-oat">
          <span className="inline-flex items-center gap-2 text-2xl font-extrabold tabular-nums">
            <Timer className="h-6 w-6 text-espresso-light" />
            {formatDuration(current.durationSeconds)}
          </span>
          <Button variant="secondary" size="sm">
            <Play className="h-4 w-4" /> Start timer
          </Button>
        </div>
      ) : null}

      <VoiceAssistantButton
        recipeTitle={recipeTitle}
        stepTitle={current.title}
        sessionId={sessionId}
        stepIndex={stepIndex}
      />

      <StepAskBox
        context={{
          recipeTitle,
          stepTitle: current.title,
          instruction: current.instruction,
        }}
        sessionId={sessionId}
        stepIndex={stepIndex}
      />

      <StepCheckButton
        context={{
          recipeTitle,
          stepTitle: current.title,
          instruction: current.instruction,
          photoCheckpoint: current.photoCheckpoint,
        }}
        sessionId={sessionId}
        stepIndex={stepIndex}
      />

      <nav className="flex items-center justify-between gap-3">
        {stepIndex > 1 ? (
          <Link href={`/cook/${id}?step=${stepIndex - 1}`}>
            <Button variant="outline" size="md">
              <ArrowLeft className="h-4 w-4" /> Previous
            </Button>
          </Link>
        ) : (
          <span />
        )}
        {stepIndex < steps.length ? (
          <Link href={`/cook/${id}?step=${stepIndex + 1}`}>
            <Button size="md">
              Done, next step <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        ) : (
          <FinishCookingButton recipe={recipe} />
        )}
      </nav>
    </div>
  );
}
