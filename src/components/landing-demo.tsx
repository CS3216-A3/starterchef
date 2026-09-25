"use client";

import {
  Apple,
  ArrowLeft,
  ArrowRight,
  Camera,
  Carrot,
  Check,
  ChevronRight,
  Clock,
  Drumstick,
  Egg,
  FileImage,
  LeafyGreen,
  Link2,
  Milk,
  ScanLine,
  Sparkles,
  Timer,
  Type,
  Video,
  VideoOff,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { ChefBuddy, type BuddyState } from "@/components/chef-buddy";
import { useInView } from "@/components/reveal";
import { cn } from "@/lib/utils";

const PAD_SEE_EW_IMAGE =
  "https://www.themealdb.com/images/media/meals/uuuspp1468263334.jpg";
const MY_FOOD_IMAGE =
  "https://www.themealdb.com/images/media/meals/rg9ze01763479093.jpg";

const detectedItems = [
  "Eggs",
  "Milk",
  "Apple",
  "Spinach",
  "Chicken thighs",
  "Carrots",
];

const shelfTop = [Egg, Milk, Apple];
const shelfBottom = [LeafyGreen, Drumstick, Carrot];

/**
 * Scan demo — mirrors the real suggest-accept flow: the camera finds items,
 * the user taps to correct the list, and nothing is saved until they confirm.
 * Auto-scans the first time it scrolls into view.
 */
export function ScanDemo() {
  const [phase, setPhase] = useState<"idle" | "scanning" | "review" | "saved">(
    "idle",
  );
  const { ref } = useInView<HTMLDivElement>(0.35, () =>
    setPhase((p) => (p === "idle" ? "scanning" : p)),
  );
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (phase !== "scanning") return;
    const timer = setTimeout(() => setPhase("review"), 1400);
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

  const kept = detectedItems.filter((name) => !removed.has(name));

  return (
    <div
      ref={ref}
      className="flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-oat"
    >
      <div className="relative flex h-44 flex-col justify-center gap-5 overflow-hidden rounded-2xl bg-oat px-6">
        <div className="flex items-end justify-around border-b-4 border-oat-dark pb-1">
          {shelfTop.map((Icon, i) => (
            <Icon key={i} className="h-9 w-9 text-espresso/50" />
          ))}
        </div>
        <div className="flex items-end justify-around border-b-4 border-oat-dark pb-1">
          {shelfBottom.map((Icon, i) => (
            <Icon key={i} className="h-9 w-9 text-espresso/50" />
          ))}
        </div>
        <span className="absolute top-2 left-2 h-5 w-5 rounded-tl-md border-t-2 border-l-2 border-espresso/40" />
        <span className="absolute top-2 right-2 h-5 w-5 rounded-tr-md border-t-2 border-r-2 border-espresso/40" />
        <span className="absolute bottom-2 left-2 h-5 w-5 rounded-bl-md border-b-2 border-l-2 border-espresso/40" />
        <span className="absolute right-2 bottom-2 h-5 w-5 rounded-br-md border-r-2 border-b-2 border-espresso/40" />
        {phase === "scanning" && (
          <span className="absolute inset-x-4 top-4 h-0.5 animate-[scan-sweep_1.4s_ease-in-out_infinite] rounded-full bg-flame shadow-[0_0_12px_2px] shadow-flame/60 motion-reduce:animate-none" />
        )}
        <span className="absolute bottom-1.5 left-3 text-[10px] font-extrabold tracking-wide text-espresso-light uppercase">
          Fridge · shelf view
        </span>
      </div>

      {phase === "review" || phase === "saved" ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {detectedItems.map((name) => {
              const isRemoved = removed.has(name);
              return (
                <button
                  key={name}
                  type="button"
                  disabled={phase === "saved"}
                  onClick={() => toggle(name)}
                  aria-pressed={!isRemoved}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition-colors",
                    isRemoved
                      ? "bg-oat text-espresso-light line-through"
                      : "bg-flame-soft text-espresso",
                  )}
                >
                  <Check className="h-3 w-3 text-flame" />
                  {name}
                </button>
              );
            })}
          </div>
          <p className="text-xs font-semibold text-espresso-light">
            {kept.length} items kept. Tap a chip to correct the list.
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
    name: "Pad see ew",
    match: 96,
    time: "25 min",
    imageUrl: PAD_SEE_EW_IMAGE,
    reasons: [
      "Uses chicken thighs and 6 more items from your kitchen",
      "Only needs your frying pan",
      "Fits your beginner skill level",
    ],
  },
  {
    name: "Spinach & mushroom frittata",
    match: 88,
    time: "20 min",
    reasons: [
      "Uses spinach, eggs and cheddar",
      "Pantry staples only",
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
  const { ref } = useInView<HTMLDivElement>(0.35, () =>
    setOpen((o) => o ?? suggestions[0].name),
  );

  return (
    <div
      ref={ref}
      className="flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-oat"
    >
      {suggestions.map((recipe) => {
        const isOpen = open === recipe.name;
        return (
          <div
            key={recipe.name}
            className="overflow-hidden rounded-2xl bg-cream ring-1 ring-oat"
          >
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : recipe.name)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 p-3 text-left"
            >
              {recipe.imageUrl && (
                <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl">
                  <Image
                    src={recipe.imageUrl}
                    alt=""
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-extrabold">
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
                <ChevronRight
                  className={cn(
                    "h-4 w-4 text-espresso-light transition-transform",
                    isOpen && "rotate-90",
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

const importSources = [
  { id: "text", label: "Text", icon: Type },
  { id: "url", label: "Link", icon: Link2 },
  { id: "photo", label: "Photo", icon: FileImage },
  { id: "video", label: "YouTube", icon: Video },
] as const;

type ImportSource = (typeof importSources)[number]["id"];

function SourcePreview({ source }: { source: ImportSource }) {
  if (source === "photo") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-espresso/15 bg-cream p-3">
        <span className="flex h-16 w-14 shrink-0 -rotate-3 flex-col gap-1 rounded bg-card p-1.5 shadow-sm ring-1 ring-oat">
          <span className="h-1.5 w-2/3 rounded-full bg-espresso/50" />
          <span className="h-0.5 w-full rounded-full bg-espresso/20" />
          <span className="h-0.5 w-full rounded-full bg-espresso/20" />
          <span className="h-0.5 w-4/5 rounded-full bg-espresso/20" />
          <span className="h-0.5 w-full rounded-full bg-espresso/20" />
          <span className="h-0.5 w-3/5 rounded-full bg-espresso/20" />
        </span>
        <span className="text-xs font-bold text-espresso-light">
          recipe-card.jpg
        </span>
      </div>
    );
  }
  if (source === "text") {
    return (
      <div className="rounded-2xl border-2 border-espresso/10 bg-cream p-3">
        <p className="line-clamp-4 text-[11px] leading-snug font-semibold text-espresso-light">
          This pad see ew is my weeknight hero. I first made it on a rainy
          Sunday and have not ordered takeout since. Chewy rice noodles,
          caramelised chicken, Chinese broccoli, and that smoky wok char. Serves
          2, ready in 25 minutes.
        </p>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-2xl border-2 border-espresso/10 bg-cream p-3 text-xs font-bold text-espresso-light">
      {source === "video" ? (
        <Video className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <Link2 className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="truncate">
        {source === "video"
          ? "youtube.com/watch?v=pad-see-ew"
          : "themealdb.com/…/pad-see-ew"}
      </span>
    </div>
  );
}

/**
 * Import demo — the real four-source picker, then a build that lands on a
 * reviewed recipe card (suggest-accept, like the actual draft flow).
 */
export function ImportDemo() {
  const [source, setSource] = useState<ImportSource>("url");
  const [phase, setPhase] = useState<"idle" | "building" | "done" | "saved">(
    "idle",
  );
  const { ref } = useInView<HTMLDivElement>(0.35, () =>
    setPhase((p) => (p === "idle" ? "building" : p)),
  );

  useEffect(() => {
    if (phase !== "building") return;
    const timer = setTimeout(() => setPhase("done"), 1500);
    return () => clearTimeout(timer);
  }, [phase]);

  const result = phase === "done" || phase === "saved";

  return (
    <div
      ref={ref}
      className="flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-oat"
    >
      <div className="grid grid-cols-4 gap-1.5">
        {importSources.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSource(id)}
            aria-pressed={source === id}
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl p-2 text-[10px] font-extrabold transition-colors",
              source === id
                ? "bg-flame text-espresso"
                : "bg-cream text-espresso-light ring-1 ring-oat hover:bg-oat",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <SourcePreview source={source} />

      {result ? (
        <>
          <div className="flex items-center gap-3 rounded-2xl bg-cream p-3 ring-1 ring-oat">
            <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl">
              <Image
                src={PAD_SEE_EW_IMAGE}
                alt="Pad see ew"
                fill
                sizes="56px"
                className="object-cover"
              />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-extrabold">
                Pad see ew
              </span>
              <span className="block text-xs font-semibold text-espresso-light">
                7 ingredients · 5 steps · ready for review
              </span>
            </span>
          </div>
          {phase === "done" ? (
            <Button size="sm" onClick={() => setPhase("saved")}>
              Review &amp; accept
            </Button>
          ) : (
            <p className="flex items-center gap-1.5 text-xs font-extrabold text-flame-ink">
              <Check className="h-4 w-4" strokeWidth={2.5} />
              Added to your recipe book.
            </p>
          )}
        </>
      ) : (
        <Button
          size="sm"
          disabled={phase === "building"}
          onClick={() => setPhase("building")}
        >
          {phase === "building" ? (
            "Building recipe…"
          ) : (
            <>
              Build recipe <Sparkles className="h-4 w-4" />
            </>
          )}
        </Button>
      )}
    </div>
  );
}

const cookSteps = [
  "Soak the rice noodles in warm water until pliable, about 15 minutes.",
  "Sear the chicken in a hot wok until just cooked through.",
  "Push the chicken aside, scramble the egg, then add noodles and sauce.",
  "Toss on high heat until the noodles char slightly, about 2 minutes.",
  "Fold in the Chinese broccoli and serve hot.",
];

const assistantAnswers = [
  "No dark soy? Mix 2 parts light soy with 1 part brown sugar for a similar colour.",
  "High heat and don't crowd the wok. The char on the noodles is what makes it pad see ew.",
];

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Cook demo — the real cook-screen loop: step navigation, a countdown timer,
 * the ChefBuddy mascot you tap to speak, and a "show my food" frame you tap
 * for a photo checkpoint.
 */
export function CookDemo() {
  const [step, setStep] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(240);
  const [timerRunning, setTimerRunning] = useState(false);
  const [buddy, setBuddy] = useState<BuddyState>("idle");
  const [answer, setAnswer] = useState<string | null>(null);
  const [showFood, setShowFood] = useState(false);
  const [checking, setChecking] = useState(false);
  const [verdict, setVerdict] = useState(false);
  const answerCount = useRef(0);
  const askTimers = useRef<number[]>([]);

  const clearAskTimers = useCallback(() => {
    askTimers.current.forEach(clearTimeout);
    askTimers.current = [];
  }, []);

  const ask = useCallback(() => {
    clearAskTimers();
    setAnswer(null);
    setBuddy("listening");
    askTimers.current.push(
      window.setTimeout(() => setBuddy("thinking"), 1300),
      window.setTimeout(() => {
        setAnswer(
          assistantAnswers[answerCount.current % assistantAnswers.length],
        );
        answerCount.current += 1;
        setBuddy("speaking");
      }, 2400),
      window.setTimeout(() => setBuddy("idle"), 4400),
    );
  }, [clearAskTimers]);

  const { ref } = useInView<HTMLDivElement>(0.35, ask);

  useEffect(() => clearAskTimers, [clearAskTimers]);

  useEffect(() => {
    if (!timerRunning || secondsLeft <= 0) return;
    const interval = setInterval(
      () => setSecondsLeft((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => clearInterval(interval);
  }, [timerRunning, secondsLeft]);

  function checkFrame() {
    if (checking || verdict) return;
    setChecking(true);
    window.setTimeout(() => {
      setChecking(false);
      setVerdict(true);
    }, 1100);
  }

  const finished = step >= cookSteps.length;

  return (
    <div
      ref={ref}
      className="flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-oat"
    >
      <div className="rounded-2xl bg-cream p-4 ring-1 ring-oat">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-extrabold tracking-wide text-espresso-light uppercase">
            {finished
              ? "Pad see ew"
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
          onClick={() => {
            setShowFood((s) => !s);
            setVerdict(false);
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-oat px-4 text-sm font-bold text-espresso transition-colors hover:bg-oat-dark"
        >
          {showFood ? (
            <VideoOff className="h-4 w-4 text-flame" />
          ) : (
            <Video className="h-4 w-4 text-flame" />
          )}
          {showFood ? "Hide my food" : "Show my food"}
        </button>
      </div>

      {showFood && (
        <div className="overflow-hidden rounded-2xl ring-1 ring-oat">
          <button
            type="button"
            onClick={checkFrame}
            disabled={checking}
            aria-label="Capture this frame for a check"
            className="group relative block w-full"
          >
            <span className="relative block aspect-video w-full">
              <Image
                src={MY_FOOD_IMAGE}
                alt="Your pan"
                fill
                sizes="(max-width: 640px) 100vw, 33vw"
                className="object-cover"
              />
            </span>
            <span className="absolute inset-0 flex items-end justify-center pb-3 transition-colors group-hover:bg-espresso/20">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-card/90 px-3 py-1.5 text-xs font-extrabold text-espresso shadow-sm">
                <Camera className="h-3.5 w-3.5" />
                {checking
                  ? "Checking…"
                  : verdict
                    ? "Checked ✓"
                    : "Tap to check this frame"}
                {!checking && !verdict && (
                  <Sparkles className="h-3 w-3 text-flame" />
                )}
              </span>
            </span>
          </button>
          <p className="bg-card px-3 py-1.5 text-xs font-semibold text-espresso-light">
            StarterChef sees only the frame you tap to check.
          </p>
        </div>
      )}

      {verdict && (
        <div className="rounded-2xl bg-oat p-3">
          <p className="text-sm font-extrabold">Looks good ✓</p>
          <p className="text-sm font-semibold text-espresso-light">
            The noodles have picked up an even, glossy colour.
          </p>
          <p className="mt-1 text-xs font-bold text-flame-ink">
            Try: one more toss before the egg goes in.
          </p>
        </div>
      )}

      <div className="flex flex-col items-center gap-1.5 py-1">
        <button
          type="button"
          onClick={ask}
          aria-label="Ask StarterChef"
          className="rounded-full transition-transform hover:scale-105"
        >
          <ChefBuddy state={buddy} size={56} />
        </button>
        <p className="inline-flex items-center gap-1.5 text-xs font-extrabold">
          Ask StarterChef <Sparkles className="h-3 w-3 text-flame" />
        </p>
        <p className="text-xs font-semibold text-espresso-light">
          {buddy === "listening"
            ? "Listening…"
            : buddy === "thinking"
              ? "Thinking…"
              : buddy === "speaking"
                ? "Speaking…"
                : "Tap to speak"}
        </p>
      </div>

      {answer && (
        <div className="rounded-2xl rounded-tl-md bg-flame-soft p-3 text-xs leading-relaxed font-semibold">
          <span className="mb-0.5 flex items-center gap-1 font-extrabold text-flame-ink">
            <Sparkles className="h-3 w-3" /> StarterChef
          </span>
          {answer}
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

const pastSessions = [
  {
    title: "Pad see ew",
    date: "Sat 20 Sep",
    duration: "28 min",
    summary:
      "Good char on the noodles. The sauce went in a little early on step 3.",
    insights: [
      "You asked about dark soy substitutes",
      "Photo check confirmed the noodle colour",
    ],
  },
  {
    title: "Spinach & mushroom frittata",
    date: "Sun 14 Sep",
    duration: "22 min",
    summary:
      "Nailed the grill finish. Eggs set evenly after switching to low heat.",
    insights: [
      "Substitution: olive oil for butter",
      "Next time: add the spinach in two batches",
    ],
  },
];

/**
 * History demo — past sessions the way the history list shows them, with the
 * StarterChef recap expanding on tap.
 */
export function HistoryDemo() {
  const [open, setOpen] = useState<number | null>(null);
  const { ref } = useInView<HTMLDivElement>(0.35, () => setOpen((o) => o ?? 0));

  return (
    <div
      ref={ref}
      className="flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-oat"
    >
      {pastSessions.map((session, index) => {
        const isOpen = open === index;
        return (
          <div
            key={session.title}
            className="rounded-2xl bg-cream ring-1 ring-oat"
          >
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : index)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 p-4 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-extrabold">
                  {session.title}
                </span>
                <span className="mt-0.5 block text-xs font-bold text-espresso-light">
                  {session.date} · {session.duration}
                </span>
                <span className="mt-1 line-clamp-1 block text-xs font-semibold text-espresso-light">
                  {session.summary}
                </span>
              </span>
              <ChevronRight
                className={cn(
                  "h-4 w-4 shrink-0 text-espresso-light transition-transform",
                  isOpen && "rotate-90",
                )}
              />
            </button>
            {isOpen && (
              <div className="mx-4 mb-4 flex flex-col gap-1.5 rounded-xl bg-flame-soft p-3">
                <p className="text-xs font-extrabold tracking-wide uppercase">
                  StarterChef recap
                </p>
                <p className="text-xs font-semibold">{session.summary}</p>
                <ul className="mt-0.5 flex flex-col gap-1">
                  {session.insights.map((insight) => (
                    <li
                      key={insight}
                      className="text-xs font-bold text-espresso-light"
                    >
                      · {insight}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
