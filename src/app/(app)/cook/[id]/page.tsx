import { notFound } from "next/navigation";
import { CookAssist } from "@/components/cook-assist";
import { CookStepNavigation } from "@/components/cook-step-navigation";
import { getSessionById } from "@/lib/session-events";

export const dynamic = "force-dynamic";

/** The cook URL is a session UUID. Progress always comes from the immutable
 * server snapshot, never from browser query parameters. */
export default async function CookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSessionById(id);
  if (!session || session.status !== "in_progress") notFound();
  const steps = session.recipe.steps ?? [];
  const current = steps.find((step) => step.index === session.current_step);
  if (!current) notFound();
  const progress = Math.round((session.current_step / steps.length) * 100);
  const version = session.version;

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
        stepIndex={session.current_step}
        totalSteps={steps.length}
        durationSeconds={current.durationSeconds}
        version={version}
        timerState={session.timer_state}
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
