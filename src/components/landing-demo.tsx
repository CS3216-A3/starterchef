"use client";

import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  Clock,
  Mic,
  ScanLine,
  Sparkles,
  Timer,
  UtensilsCrossed,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/button";
import { cn } from "@/lib/utils";

const detectedItems = [
  { name: "Eggs", kind: "ingredient", soon: false },
  { name: "Spinach", kind: "ingredient", soon: true },
  { name: "Mushrooms", kind: "ingredient", soon: true },
  { name: "Cheddar", kind: "ingredient", soon: false },
  { name: "Frying pan", kind: "equipment", soon: false },
  { name: "Rice cooker", kind: "equipment", soon: false },
] as const;

/**
 * Scan demo — mirrors the real suggest-accept flow: the camera finds items,
 * the user taps to correct the list, and nothing is saved until they confirm.
 */
export function ScanDemo() {
  const [phase, setPhase] = useState<"idle" | "scanning" | "review" | "saved">(
    "idle",
  );
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (phase !== "scanning") return;
    const timer = setTimeout(() => setPhase("review"), 1100);
    return () => clearTimeout(timer);
  }, [phase]);

  function toggle(name: string) {
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  const kept = detectedItems.filter((item) => !removed.has(item.name));
  const expiring = kept.filter((item) => item.soon);

  return (
    <div className="flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-oat">
      <div className="relative flex h-36 items-center justify-center rounded-2xl bg-oat">
        <span className="absolute top-3 left-3 h-6 w-6 rounded-tl-lg border-t-2 border-l-2 border-espresso/40" />
        <span className="absolute top-3 right-3 h-6 w-6 rounded-tr-lg border-t-2 border-r-2 border-espresso/40" />
        <span className="absolute bottom-3 left-3 h-6 w-6 rounded-bl-lg border-b-2 border-l-2 border-espresso/40" />
        <span className="absolute right-3 bottom-3 h-6 w-6 rounded-br-lg border-r-2 border-b-2 border-espresso/40" />
        {phase === "scanning" ? (
          <span className="absolute inset-x-6 h-0.5 animate-pulse rounded-full bg-flame" />
        ) : (
          <ScanLine className="h-8 w-8 text-espresso-light" />
        )}
        <span className="absolute bottom-3 text-xs font-bold text-espresso-light">
          {phase === "scanning" ? "Scanning…" : "Fridge shelf"}
        </span>
      </div>

      {phase === "review" || phase === "saved" ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {detectedItems.map((item) => {
              const isRemoved = removed.has(item.name);
              return (
                <button
                  key={item.name}
                  type="button"
                  disabled={phase === "saved"}
                  onClick={() => toggle(item.name)}
                  aria-pressed={!isRemoved}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition-colors",
                    isRemoved
                      ? "bg-oat text-espresso-light line-through"
                      : item.kind === "equipment"
                        ? "bg-oat text-espresso"
                        : "bg-flame-soft text-espresso",
                  )}
                >
                  {item.kind === "equipment" ? (
                    <UtensilsCrossed className="h-3 w-3" />
                  ) : (
                    <Check className="h-3 w-3 text-flame" />
                  )}
                  {item.name}
                </button>
              );
            })}
          </div>
          <p className="text-xs font-semibold text-espresso-light">
            {kept.length} items kept
            {expiring.length > 0 &&
              `, ${expiring.map((i) => i.name.toLowerCase()).join(" and ")} expire soon`}
            . Tap a chip to correct the list.
          </p>
          {phase === "review" ? (
            <Button size="sm" onClick={() => setPhase("saved")}>
              <Check className="h-4 w-4" /> Save to my kitchen
            </Button>
          ) : (
            <p className="flex items-center gap-1.5 text-xs font-extrabold text-flame-ink">
              <Check className="h-4 w-4" strokeWidth={2.5} />
              Saved. Suggestions now match this inventory.
            </p>
          )}
        </>
      ) : (
        <Button
          size="sm"
          disabled={phase === "scanning"}
          onClick={() => setPhase("scanning")}
        >
          <ScanLine className="h-4 w-4" />
          {phase === "scanning" ? "Scanning…" : "Scan my kitchen"}
        </Button>
      )}
    </div>
  );
}

const suggestions = [
  {
    name: "Spinach & mushroom frittata",
    match: 96,
    time: "20 min",
    reasons: [
      "Uses the spinach that expires soon",
      "All 5 ingredients already in your kitchen",
      "Only needs your frying pan",
    ],
  },
  {
    name: "Cheesy mushroom rice bowl",
    match: 88,
    time: "25 min",
    reasons: [
      "Pantry staples only",
      "Cooks in your rice cooker",
      "Beginner-friendly techniques",
    ],
  },
];

/**
 * Match demo — tap a suggestion to see the reasons it was ranked for this
 * kitchen, like the real recommendation panel.
 */
export function RecipeMatchDemo() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-oat">
      {suggestions.map((recipe) => {
        const isOpen = open === recipe.name;
        return (
          <div
            key={recipe.name}
            className="rounded-2xl bg-cream ring-1 ring-oat"
          >
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : recipe.name)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-3 p-4 text-left"
            >
              <span>
                <span className="block text-sm font-extrabold">
                  {recipe.name}
                </span>
                <span className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-espresso-light">
                  <Clock className="h-3.5 w-3.5" /> {recipe.time} · tap to see
                  why
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="rounded-full bg-flame-soft px-2 py-0.5 text-xs font-extrabold text-flame-ink">
                  {recipe.match}%
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-espresso-light transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </span>
            </button>
            {isOpen && (
              <ul className="flex flex-col gap-1.5 border-t border-oat px-4 py-3">
                {recipe.reasons.map((reason) => (
                  <li
                    key={reason}
                    className="flex items-center gap-2 text-xs font-semibold text-espresso-light"
                  >
                    <Check
                      className="h-3.5 w-3.5 shrink-0 text-flame"
                      strokeWidth={2.5}
                    />
                    {reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

const cookSteps = [
  "Whisk 6 eggs with a pinch of salt and pepper.",
  "Sauté the mushrooms in butter until golden, about 4 minutes.",
  "Add the spinach until wilted, then pour in the eggs.",
  "Cook on low until the edges set, then finish under the grill for 3–4 minutes.",
  "Rest 2 minutes, slice, and serve.",
];

const assistantAnswers = [
  "No butter? Olive oil works. Use the same amount.",
  "Medium-low heat. If the bottom browns before the top sets, move it under the grill sooner.",
];

const photoVerdict =
  "Edges look set and the centre still jiggles slightly. You are ready for the grill step.";

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Cook demo — the hands-free loop: step navigation, a real countdown timer,
 * an assistant answer, and a photo checkpoint verdict.
 */
export function CookDemo() {
  const [step, setStep] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(240);
  const [timerRunning, setTimerRunning] = useState(false);
  const [bubble, setBubble] = useState<
    { kind: "answer"; index: number } | { kind: "photo" } | null
  >(null);

  useEffect(() => {
    if (!timerRunning || secondsLeft <= 0) return;
    const interval = setInterval(
      () => setSecondsLeft((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => clearInterval(interval);
  }, [timerRunning, secondsLeft]);

  const finished = step >= cookSteps.length;

  return (
    <div className="flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-oat">
      <div className="rounded-2xl bg-cream p-4 ring-1 ring-oat">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-extrabold tracking-wide text-espresso-light uppercase">
            {finished
              ? "Spinach & mushroom frittata"
              : `Step ${step + 1} of ${cookSteps.length}`}
          </p>
          {!finished && (
            <span className="flex gap-1">
              {cookSteps.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 w-4 rounded-full",
                    i <= step ? "bg-flame" : "bg-oat",
                  )}
                />
              ))}
            </span>
          )}
        </div>
        <p className="text-sm leading-relaxed font-semibold">
          {finished
            ? "Nice work. That is dinner sorted, and StarterChef saved this session to your cooking history."
            : cookSteps[step]}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (secondsLeft === 0) {
              setSecondsLeft(240);
              setTimerRunning(false);
            } else {
              setTimerRunning((r) => !r);
            }
          }}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-bold transition-colors",
            timerRunning
              ? "bg-flame text-espresso"
              : "bg-oat text-espresso hover:bg-oat-dark",
          )}
        >
          <Timer className="h-4 w-4" />
          {secondsLeft === 0
            ? "Restart 4:00"
            : timerRunning
              ? `${formatClock(secondsLeft)} · pause`
              : `${formatClock(secondsLeft)} · start`}
        </button>
        <button
          type="button"
          onClick={() =>
            setBubble((b) =>
              b?.kind === "answer"
                ? {
                    kind: "answer",
                    index: (b.index + 1) % assistantAnswers.length,
                  }
                : { kind: "answer", index: 0 },
            )
          }
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-oat px-4 text-sm font-bold text-espresso transition-colors hover:bg-oat-dark"
        >
          <Mic className="h-4 w-4 text-flame" />
          {bubble?.kind === "answer" ? "Ask again" : "Ask"}
        </button>
        <button
          type="button"
          onClick={() => setBubble({ kind: "photo" })}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-oat px-4 text-sm font-bold text-espresso transition-colors hover:bg-oat-dark"
        >
          <Camera className="h-4 w-4 text-flame" />
          Photo check
        </button>
      </div>

      {bubble && (
        <div className="rounded-2xl rounded-tl-md bg-flame-soft p-3 text-xs leading-relaxed font-semibold">
          <span className="mb-0.5 flex items-center gap-1 font-extrabold text-flame-ink">
            <Sparkles className="h-3 w-3" />
            {bubble.kind === "photo" ? "Photo checkpoint" : "StarterChef"}
          </span>
          {bubble.kind === "photo"
            ? photoVerdict
            : assistantAnswers[bubble.index]}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        {finished ? (
          <Button size="sm" onClick={() => setStep(0)}>
            Cook it again
          </Button>
        ) : (
          <Button size="sm" onClick={() => setStep((s) => s + 1)}>
            {step === cookSteps.length - 1 ? "Finish cooking" : "Done, next"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
