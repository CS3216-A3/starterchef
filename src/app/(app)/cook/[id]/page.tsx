import { ArrowLeft, ArrowRight, CookingPot, Play, Timer } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AskAssistantButton } from "@/components/ask-assistant-button";
import { Button } from "@/components/button";
import { mockCookingSession, mockRecipes } from "@/lib/mock-data";

export default async function CookPage({
  params,
  searchParams,
}: PageProps<"/cook/[id]">) {
  const { id } = await params;
  const { step } = await searchParams;

  const recipe = mockRecipes.find((r) => r.id === id);
  if (!recipe) notFound();

  const { recipeTitle, steps } = mockCookingSession;
  const stepIndex = Math.min(Math.max(Number(step ?? 1) || 1, 1), steps.length);
  const current = steps[stepIndex - 1];
  const progress = Math.round((stepIndex / steps.length) * 100);

  function formatDuration(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
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

      <div className="flex aspect-video items-center justify-center rounded-3xl bg-gradient-to-br from-flame-soft to-oat">
        <CookingPot
          className="h-14 w-14 text-espresso/25"
          strokeWidth={1.5}
          aria-hidden="true"
        />
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

      <AskAssistantButton recipeTitle={recipeTitle} stepTitle={current.title} />

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
          <Link href="/today">
            <Button size="md">Finish cooking</Button>
          </Link>
        )}
      </nav>
    </div>
  );
}
