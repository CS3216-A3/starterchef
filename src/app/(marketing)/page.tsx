import {
  Camera,
  Check,
  ChefHat,
  CookingPot,
  History,
  Import,
  Minus,
  ScanLine,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { buttonStyles } from "@/components/button";
import {
  CookDemo,
  HistoryDemo,
  ImportDemo,
  RecipeMatchDemo,
  ScanDemo,
} from "@/components/landing-demo";
import { Reveal } from "@/components/reveal";
import {
  CORE_FEATURES,
  FEATURE_ROWS,
  PLANS,
  TOP_UPS,
  approxCooks,
  type TopUp,
} from "@/lib/credits";

export const metadata: Metadata = {
  title: { absolute: "StarterChef · Your start to great cooking" },
  alternates: { canonical: "/" },
};

const howItWorks = [
  {
    icon: ScanLine,
    title: "Scan your kitchen",
    body: "Point your camera at the fridge or pantry. StarterChef recognises ingredients and equipment, and always lets you correct the list before anything is saved.",
    Demo: ScanDemo,
  },
  {
    icon: Sparkles,
    title: "Recipes that fit your kitchen",
    body: "Every suggestion is ranked by what you have, your equipment, dietary needs, skill level, and how much time you have. Open a card to see exactly why it was picked.",
    Demo: RecipeMatchDemo,
  },
  {
    icon: Import,
    title: "Import any recipe",
    body: "Paste a link, a photo of a recipe card, plain text, or a YouTube video. StarterChef extracts it into a structured recipe you review before it joins your book.",
    Demo: ImportDemo,
  },
  {
    icon: CookingPot,
    title: "Cook step by step",
    body: "Move through one step at a time with big tap targets and built-in timers. Tap the mascot to ask a question by voice, or show your pan for a photo checkpoint.",
    Demo: CookDemo,
  },
  {
    icon: History,
    title: "Look back on every cook",
    body: "Each finished session gets a StarterChef recap with what you asked, the photo checkpoints, and what to try next time. Cross-session memory is part of Plus.",
    Demo: HistoryDemo,
  },
];

const topUpCopy: Record<TopUp["id"], string> = {
  small: "Occasional extra AI help.",
  large: "Better value for frequent video imports and live voice.",
};

const sgd = (amount: number) => `S$${amount.toFixed(2)}`;

function PlanCell({ value }: { value: string }) {
  if (value === "✓") {
    return (
      <>
        <Check
          className="mx-auto h-4 w-4 text-flame-ink"
          strokeWidth={2.5}
          aria-hidden="true"
        />
        <span className="sr-only">Included</span>
      </>
    );
  }
  if (value === "—") {
    return (
      <>
        <Minus
          className="mx-auto h-4 w-4 text-espresso-light/50"
          strokeWidth={2.5}
          aria-hidden="true"
        />
        <span className="sr-only">Not included</span>
      </>
    );
  }
  return <span className="text-xs font-bold sm:text-sm">{value}</span>;
}

export default function LandingPage() {
  const [freePlan, plusPlan] = PLANS;

  return (
    <>
      <section className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-4 pt-16 pb-20 text-center sm:px-6 sm:pt-24">
        <span className="inline-flex items-center gap-2 rounded-full bg-oat px-4 py-1.5 text-xs font-extrabold tracking-wide text-espresso uppercase">
          <ChefHat className="h-4 w-4 text-flame" />
          For cooking beginners
        </span>
        <h1 className="max-w-3xl text-4xl leading-tight font-extrabold tracking-tight sm:text-6xl">
          Your start to <span className="text-flame-ink">great cooking.</span>
        </h1>
        <p className="max-w-xl text-lg font-semibold text-espresso-light">
          StarterChef sees what&apos;s in your kitchen, suggests meals you can
          actually make, and talks you through every step, no experience needed.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/today" className={buttonStyles({ size: "lg" })}>
            <Camera className="h-5 w-5" />
            Scan my kitchen
          </Link>
          <a
            href="#how-it-works"
            className={buttonStyles({ size: "lg", variant: "outline" })}
          >
            See how it works
          </a>
        </div>
      </section>

      <section
        id="how-it-works"
        className="mx-auto flex w-full max-w-5xl scroll-mt-20 flex-col gap-12 px-4 pb-20 sm:px-6"
      >
        <h2 className="text-center text-2xl font-extrabold sm:text-3xl">
          How it works
        </h2>
        {howItWorks.map(({ icon: Icon, title, body, Demo }, index) => (
          <Reveal key={title}>
            <div className="grid items-center gap-6 sm:grid-cols-2 sm:gap-10">
              <div className={index % 2 === 1 ? "sm:order-2" : ""}>
                <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-flame-soft">
                  <Icon className="h-5 w-5 text-flame" />
                </span>
                <h3 className="mb-2 text-xl font-extrabold">{title}</h3>
                <p className="max-w-md text-sm leading-relaxed font-semibold text-espresso-light">
                  {body}
                </p>
              </div>
              <div className={index % 2 === 1 ? "sm:order-1" : ""}>
                <Demo />
              </div>
            </div>
          </Reveal>
        ))}
      </section>

      <section
        id="pricing"
        className="mx-auto w-full max-w-5xl scroll-mt-20 px-4 pb-24 sm:px-6"
      >
        <h2 className="mb-2 text-center text-2xl font-extrabold sm:text-3xl">
          Simple pricing
        </h2>
        <p className="mx-auto mb-8 max-w-md text-center text-sm font-semibold text-espresso-light">
          AI features like scanning, suggestions, voice, and adaptations run on
          credits. Everything else is free, always.
        </p>

        <Reveal>
          <div className="overflow-hidden rounded-3xl bg-card shadow-sm ring-1 ring-oat">
            <table className="w-full table-fixed">
              <thead>
                <tr className="border-b border-oat">
                  <th className="w-1/2 p-4 text-left align-bottom sm:p-5">
                    <span className="text-xs font-extrabold tracking-wide text-espresso-light uppercase">
                      What you get
                    </span>
                  </th>
                  {[freePlan, plusPlan].map((plan) => (
                    <th
                      key={plan.id}
                      className={`w-1/4 p-4 align-bottom sm:p-5 ${
                        plan.id === "plus" ? "bg-flame-soft/50" : ""
                      }`}
                    >
                      <span className="block text-sm font-extrabold sm:text-base">
                        {plan.name}
                      </span>
                      <span className="mt-1 block text-lg font-extrabold text-flame-ink sm:text-xl">
                        {plan.priceSgd === 0
                          ? "Free"
                          : `${sgd(plan.priceSgd)}/mo`}
                      </span>
                      {plan.annualPriceSgd && (
                        <span className="block text-xs font-bold text-espresso-light">
                          or {sgd(plan.annualPriceSgd)}/year
                        </span>
                      )}
                      <span className="mt-1 block text-xs font-semibold text-espresso-light">
                        ≈ {approxCooks(plan.credits)} AI-assisted cooks / month
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-oat">
                  <td className="p-4 text-xs font-bold sm:p-5 sm:text-sm">
                    AI credits
                  </td>
                  <td className="p-4 text-center sm:p-5">
                    <PlanCell
                      value={`${freePlan.credits.toLocaleString()} / month`}
                    />
                  </td>
                  <td className="bg-flame-soft/50 p-4 text-center sm:p-5">
                    <PlanCell
                      value={`${plusPlan.credits.toLocaleString()} / month`}
                    />
                  </td>
                </tr>
                <tr className="border-b border-oat">
                  <td className="p-4 text-xs font-bold sm:p-5 sm:text-sm">
                    Core features
                  </td>
                  <td
                    colSpan={2}
                    className="p-4 text-center text-xs font-semibold text-espresso-light sm:p-5"
                  >
                    {CORE_FEATURES.join(" · ")}
                  </td>
                </tr>
                {FEATURE_ROWS.map((row) => (
                  <tr
                    key={row.label}
                    className="border-b border-oat last:border-0"
                  >
                    <td className="p-4 text-xs font-bold sm:p-5 sm:text-sm">
                      {row.label}
                    </td>
                    <td className="p-4 text-center sm:p-5">
                      <PlanCell value={row.free} />
                    </td>
                    <td className="bg-flame-soft/50 p-4 text-center sm:p-5">
                      <PlanCell value={row.plus} />
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="p-4 sm:p-5" />
                  <td className="p-4 text-center sm:p-5">
                    <Link
                      href="/today"
                      className={buttonStyles({
                        size: "sm",
                        variant: "outline",
                        className: "w-full",
                      })}
                    >
                      Start free
                    </Link>
                  </td>
                  <td className="bg-flame-soft/50 p-4 text-center sm:p-5">
                    <Link
                      href="/today"
                      className={buttonStyles({
                        size: "sm",
                        className: "w-full",
                      })}
                    >
                      Get started
                    </Link>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Reveal>

        <p className="mt-4 text-center text-xs font-semibold text-espresso-light">
          Credit use varies by action. Top-ups add credits; they do not unlock
          Plus-only features.
        </p>

        <Reveal>
          <h3 className="mt-8 mb-4 text-center text-sm font-extrabold tracking-wide text-espresso-light uppercase">
            Need more credits? Top up any time
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {TOP_UPS.map((topUp) => (
              <div
                key={topUp.id}
                className="flex items-center justify-between gap-4 rounded-2xl bg-oat p-4"
              >
                <div>
                  <p className="text-sm font-extrabold">
                    {topUp.name} · {topUp.credits.toLocaleString()} credits
                  </p>
                  <p className="text-xs font-semibold text-espresso-light">
                    {topUpCopy[topUp.id]}
                  </p>
                </div>
                <p className="shrink-0 text-lg font-extrabold text-flame-ink">
                  {sgd(topUp.priceSgd)}
                </p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>
    </>
  );
}
