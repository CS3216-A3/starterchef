import { ArrowRight, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { CookAssist } from "@/components/cook-assist";
import { CookStepNavigation } from "@/components/cook-step-navigation";
import { StepPhoto } from "@/components/step-photo";
import { getRecipeById } from "@/lib/data";
import { getSessionById } from "@/lib/session-events";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** The cook URL is a session UUID. Progress always comes from the immutable
 * server snapshot, never from browser query parameters. `?prep` shows the
 * mise en place screen before the first step. */
export default async function CookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ prep?: string }>;
}) {
  const { id } = await params;
  const { prep } = await searchParams;
  const session = await getSessionById(id);
  if (!session || session.status !== "in_progress") notFound();
  const steps = session.recipe.steps ?? [];
  const current = steps.find((step) => step.index === session.current_step);
  if (!current) notFound();
  const progress = Math.round((session.current_step / steps.length) * 100);
  const version = session.version;
  // Sessions from databases that have not applied 0029 lack timer_state.
  // Keep the cook screen usable instead of crashing while rendering a timer.
  const timerState = session.timer_state ?? { status: "idle" as const };

  // Mise en place: gather ingredients and equipment before the first
  // instruction instead of dropping straight into step 1.
  if (prep !== undefined) {
    const recipe = session.recipe_id
      ? await getRecipeById(session.recipe_id)
      : null;
    const allIngredients = recipe?.ingredients ?? [];
    const allEquipment = recipe?.equipment ?? [];
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-6">
        <BackButton />
        <header className="flex flex-col gap-1">
          <p className="text-xs font-bold tracking-wide text-espresso-light uppercase">
            {session.recipe.title}
          </p>
          <h1 className="text-2xl font-extrabold">Get everything ready</h1>
          <p className="text-sm font-semibold text-espresso-light">
            {recipe
              ? `${recipe.minutes} min · ${recipe.difficulty} · serves ${recipe.servings} · `
              : ""}
            {steps.length} steps
          </p>
          {recipe?.description ? (
            <p className="text-sm font-semibold text-espresso-light">
              {recipe.description}
            </p>
          ) : null}
        </header>

        {allIngredients.length > 0 ? (
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
        ) : null}

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
                <span className="w-5 shrink-0 text-right font-extrabold text-flame-ink">
                  {s.index}
                </span>
                <span className="text-espresso-light">{s.title}</span>
              </li>
            ))}
          </ol>
        </section>

        <div className="flex flex-col gap-2">
          <Link href={`/cook/${id}`} className="self-stretch">
            <Button size="md" className="w-full">
              {session.current_step > 1
                ? `Resume cooking · step ${session.current_step}`
                : "Start cooking"}{" "}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          {recipe && recipe.user_id === session.user_id ? (
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

  // The latest checkpoint photo for this step — shown under the instruction
  // so the cook can compare (and remove it) without touching the timeline.
  const supabase = await createClient();
  const { data: checkpoint } = await supabase
    .from("cooking_checkpoints")
    .select("id, object_path")
    .eq("session_id", session.id)
    .eq("step_index", session.current_step)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let checkpointPhotoUrl: string | null = null;
  if (checkpoint) {
    const { data: signed } = await createAdminClient()
      .storage.from("recipe-inputs")
      .createSignedUrl(checkpoint.object_path, 5 * 60);
    checkpointPhotoUrl = signed?.signedUrl ?? null;
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-bold tracking-wide text-espresso-light uppercase">
          {session.recipe.title}
        </p>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold">
            Step {session.current_step} of {steps.length}
          </h1>
          <span className="text-sm font-extrabold text-flame-ink">
            {progress}%
          </span>
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
        {checkpointPhotoUrl && checkpoint ? (
          <StepPhoto
            sessionId={session.id}
            checkpointId={checkpoint.id}
            photoUrl={checkpointPhotoUrl}
          />
        ) : null}
        {current.photoCheckpoint && (
          <p className="text-xs font-semibold text-espresso-light">
            What it should look like: {current.photoCheckpoint}
          </p>
        )}
        {current.tip && (
          <p className="rounded-2xl bg-flame-soft p-3 text-sm font-semibold">
            Tip: {current.tip}
          </p>
        )}
      </section>
      <CookAssist
        sessionId={session.id}
        recipeId={session.recipe_id}
        stepIndex={session.current_step}
        currentInstruction={current.instruction}
        totalSteps={steps.length}
        durationSeconds={current.durationSeconds}
        version={version}
        timerState={timerState}
      />
      <CookStepNavigation
        sessionId={session.id}
        currentStep={session.current_step}
        totalSteps={steps.length}
        version={version}
      />
    </div>
  );
}
