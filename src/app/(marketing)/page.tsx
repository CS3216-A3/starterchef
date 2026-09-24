import {
  Camera,
  ChefHat,
  Mic,
  ScanLine,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/button";
import {
  CORE_FEATURES,
  FEATURE_ROWS,
  PLANS,
  TOP_UPS,
  approxCooks,
  type TopUp,
} from "@/lib/credits";

export const metadata: Metadata = {
  title: "StarterChef · Cook with what you have",
};

const features = [
  {
    icon: ScanLine,
    title: "Scan your kitchen",
    body: "Point your camera at your fridge and pantry. StarterChef recognises your ingredients and equipment, and keeps your kitchen inventory up to date.",
  },
  {
    icon: Sparkles,
    title: "Recipes that fit you",
    body: "Suggestions ranked by what you already have, what expires soon, your equipment, dietary needs, skill level, and how much time you have.",
  },
  {
    icon: Mic,
    title: "Cook hands-free",
    body: "One step at a time, with voice navigation, timers, and an assistant that answers questions and troubleshoots while you cook.",
  },
  {
    icon: TrendingUp,
    title: "Level up over time",
    body: "StarterChef learns your taste, remembers your wins and mistakes, and gradually unlocks new techniques as your skills grow.",
  },
];

const topUpCopy: Record<TopUp["id"], string> = {
  small: "Occasional extra AI help.",
  large: "Better value for frequent video imports and live voice.",
};

const sgd = (amount: number) => `S$${amount.toFixed(2)}`;

export default function LandingPage() {
  return (
    <>
      <section className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-4 pt-16 pb-20 text-center sm:px-6 sm:pt-24">
        <span className="inline-flex items-center gap-2 rounded-full bg-oat px-4 py-1.5 text-xs font-extrabold tracking-wide text-espresso uppercase">
          <ChefHat className="h-4 w-4 text-flame" />
          For cooking beginners
        </span>
        <h1 className="max-w-3xl text-4xl leading-tight font-extrabold tracking-tight sm:text-6xl">
          Good food starts with{" "}
          <span className="text-flame">what you have.</span>
        </h1>
        <p className="max-w-xl text-lg font-semibold text-espresso-light">
          StarterChef sees what&apos;s in your kitchen, suggests meals you can
          actually make, and talks you through every step, no experience needed.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/today">
            <Button size="lg">
              <Camera className="h-5 w-5" />
              Scan my kitchen
            </Button>
          </Link>
          <a href="#features">
            <Button size="lg" variant="outline">
              See how it works
            </Button>
          </a>
        </div>
      </section>

      <section
        id="features"
        className="mx-auto w-full max-w-5xl scroll-mt-20 px-4 pb-20 sm:px-6"
      >
        <h2 className="mb-8 text-center text-2xl font-extrabold sm:text-3xl">
          Your AI sous-chef
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {features.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-3xl bg-card p-6 shadow-sm ring-1 ring-oat"
            >
              <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-flame-soft">
                <Icon className="h-5 w-5 text-flame" />
              </span>
              <h3 className="mb-1 text-lg font-extrabold">{title}</h3>
              <p className="text-sm leading-relaxed font-semibold text-espresso-light">
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        id="pricing"
        className="mx-auto w-full max-w-5xl scroll-mt-20 px-4 pb-24 sm:px-6"
      >
        <h2 className="mb-2 text-center text-2xl font-extrabold sm:text-3xl">
          Simple pricing
        </h2>
        <p className="mx-auto mb-8 max-w-md text-center text-sm font-semibold text-espresso-light">
          Every plan gets the core app for free. AI features run on a monthly
          credit budget, and Plus unlocks the full experience.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className="flex flex-col rounded-3xl bg-card p-6 shadow-sm ring-1 ring-oat"
            >
              <h3 className="text-lg font-extrabold">{plan.name}</h3>
              <p className="mt-1 text-3xl font-extrabold text-flame">
                {plan.priceSgd === 0 ? "Free" : `${sgd(plan.priceSgd)}/mo`}
                {plan.annualPriceSgd && (
                  <span className="ml-1.5 text-sm font-bold text-espresso-light">
                    or {sgd(plan.annualPriceSgd)}/year
                  </span>
                )}
              </p>
              <p className="mt-2 text-sm font-extrabold">
                {plan.credits.toLocaleString()} AI credits / month
                <span className="font-semibold text-espresso-light">
                  {" "}
                  — about {approxCooks(plan.credits)} cook
                  {approxCooks(plan.credits) === 1 ? "" : "s"}
                </span>
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6 overflow-x-auto rounded-3xl bg-card shadow-sm ring-1 ring-oat">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-oat">
                <th className="p-4 font-extrabold">Feature</th>
                <th className="p-4 text-center font-extrabold">Free Starter</th>
                <th className="p-4 text-center font-extrabold text-flame">
                  Plus
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-oat">
                <td className="p-4 font-bold">Core features</td>
                <td
                  colSpan={2}
                  className="p-4 text-xs font-semibold text-espresso-light"
                >
                  {CORE_FEATURES.join(" · ")}
                </td>
              </tr>
              {FEATURE_ROWS.map((row) => (
                <tr
                  key={row.label}
                  className="border-b border-oat last:border-0"
                >
                  <td className="p-4 font-bold">{row.label}</td>
                  <td className="p-4 text-center font-semibold text-espresso-light">
                    {row.free}
                  </td>
                  <td className="p-4 text-center font-bold text-flame">
                    {row.plus}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

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
              <p className="shrink-0 text-lg font-extrabold text-flame">
                {sgd(topUp.priceSgd)}
              </p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
