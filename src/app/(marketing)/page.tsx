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

const tiers = [
  {
    name: "Free Starter",
    price: "Free",
    blurb: "1,000 welcome credits — a real chance to try the AI features.",
    points: [
      "Kitchen profile & recipe book",
      "Timers & manual recipe entry",
      "Basic step navigation",
    ],
  },
  {
    name: "Plus",
    price: "S$4.90/mo",
    priceNote: "or S$39.90/year",
    blurb: "2,500 credits every month, plus everything in Free Starter.",
    points: [
      "Personal recipe versions",
      "Progress history",
      "Priority AI processing",
    ],
  },
];

const topUps = [
  {
    name: "Small",
    price: "S$2.90",
    credits: "1,000 credits",
    blurb: "Occasional extra AI help.",
  },
  {
    name: "Large",
    price: "S$7.90",
    credits: "3,000 credits",
    blurb: "Better value for frequent visual/video use.",
  },
];

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
          AI features (scanning, suggestions, voice, adaptations) run on
          credits. Everything else is free, always.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className="flex flex-col rounded-3xl bg-card p-6 shadow-sm ring-1 ring-oat"
            >
              <h3 className="text-lg font-extrabold">{tier.name}</h3>
              <p className="mt-1 text-3xl font-extrabold text-flame">
                {tier.price}
                {tier.priceNote && (
                  <span className="ml-1.5 text-sm font-bold text-espresso-light">
                    {tier.priceNote}
                  </span>
                )}
              </p>
              <p className="mt-2 text-sm font-semibold text-espresso-light">
                {tier.blurb}
              </p>
              <ul className="mt-4 flex flex-col gap-2 text-sm font-semibold">
                {tier.points.map((point) => (
                  <li key={point} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-flame" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <h3 className="mt-8 mb-4 text-center text-sm font-extrabold tracking-wide text-espresso-light uppercase">
          Need more credits? Top up any time
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {topUps.map((topUp) => (
            <div
              key={topUp.name}
              className="flex items-center justify-between gap-4 rounded-2xl bg-oat p-4"
            >
              <div>
                <p className="text-sm font-extrabold">
                  {topUp.name} · {topUp.credits}
                </p>
                <p className="text-xs font-semibold text-espresso-light">
                  {topUp.blurb}
                </p>
              </div>
              <p className="shrink-0 text-lg font-extrabold text-flame">
                {topUp.price}
              </p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
