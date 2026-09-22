"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Link2 } from "lucide-react";
import { Button } from "@/components/button";
import { ScanKitchenButton } from "@/components/scan-kitchen-button";
import { completeOnboarding, skipOnboarding } from "@/app/onboarding/actions";
import { cn } from "@/lib/utils";
import type { ProfileRow } from "@/lib/types";

const DIETARY_OPTIONS = [
  "vegetarian",
  "vegan",
  "halal",
  "kosher",
  "gluten-free",
  "dairy-free",
  "nut-free",
] as const;

const SKILL_OPTIONS = [
  { value: "beginner", label: "Beginner", hint: "I'm just getting started" },
  {
    value: "intermediate",
    label: "Intermediate",
    hint: "I cook a few times a week",
  },
  { value: "advanced", label: "Advanced", hint: "I improvise without recipes" },
] as const;

const inputClass =
  "h-11 w-full rounded-full border-2 border-oat bg-cream px-4 text-sm font-semibold outline-none placeholder:text-espresso-light/60 focus:border-flame";

const STEPS = [
  "About you",
  "Diet & allergies",
  "Your kitchen",
  "First recipe",
] as const;

/**
 * First-run onboarding wizard: profile → dietary needs → optional kitchen
 * scan → optional recipe import. Finishing marks profiles.onboarded_at.
 */
export function OnboardingWizard({ profile }: { profile: ProfileRow | null }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [householdSize, setHouseholdSize] = useState(
    profile?.household_size ?? 2,
  );
  const [skillLevel, setSkillLevel] = useState<ProfileRow["skill_level"]>(
    profile?.skill_level ?? "beginner",
  );
  const [restrictions, setRestrictions] = useState<string[]>(
    profile?.dietary_restrictions ?? [],
  );
  const [allergiesText, setAllergiesText] = useState(
    (profile?.allergies ?? []).join(", "),
  );

  function toggleRestriction(option: string) {
    setRestrictions((prev) =>
      prev.includes(option)
        ? prev.filter((r) => r !== option)
        : [...prev, option],
    );
  }

  function finish() {
    startTransition(async () => {
      const res = await completeOnboarding({
        displayName,
        dietaryRestrictions: restrictions,
        allergies: allergiesText.split(","),
        skillLevel,
        householdSize,
      });
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      router.push("/today");
    });
  }

  function skip() {
    startTransition(async () => {
      await skipOnboarding();
      router.push("/today");
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      {/* Progress */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-bold text-espresso-light">
          <span>
            Step {step + 1} of {STEPS.length}
          </span>
          <button
            type="button"
            onClick={skip}
            className="underline underline-offset-2 hover:text-espresso"
          >
            Skip for now
          </button>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-oat">
          <div
            className="h-full rounded-full bg-flame transition-all"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {step === 0 && (
        <div className="flex flex-col gap-5 rounded-3xl bg-card p-6 ring-1 ring-oat">
          <div>
            <h1 className="text-2xl font-extrabold">Welcome to StarterChef</h1>
            <p className="mt-1 text-sm font-semibold text-espresso-light">
              A few quick questions so we can tailor recipes to you.
            </p>
          </div>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-extrabold">
              What should we call you?
            </span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-extrabold">
              How many people do you usually cook for?
            </span>
            <input
              type="number"
              min={1}
              max={20}
              value={householdSize}
              onChange={(e) => setHouseholdSize(Number(e.target.value))}
              className={inputClass}
            />
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-extrabold">
              Cooking experience
            </legend>
            <div className="flex flex-col gap-2">
              {SKILL_OPTIONS.map(({ value, label, hint }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSkillLevel(value)}
                  className={cn(
                    "rounded-2xl px-4 py-3 text-left ring-1 transition-colors",
                    skillLevel === value
                      ? "bg-flame-soft ring-flame"
                      : "bg-cream ring-oat hover:bg-oat",
                  )}
                >
                  <span className="block text-sm font-extrabold">{label}</span>
                  <span className="block text-xs font-semibold text-espresso-light">
                    {hint}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-5 rounded-3xl bg-card p-6 ring-1 ring-oat">
          <div>
            <h1 className="text-2xl font-extrabold">Diet & allergies</h1>
            <p className="mt-1 text-sm font-semibold text-espresso-light">
              We&apos;ll never suggest a recipe that conflicts with these.
            </p>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-extrabold">Dietary needs</legend>
            <div className="flex flex-wrap gap-2">
              {DIETARY_OPTIONS.map((option) => {
                const active = restrictions.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleRestriction(option)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-bold transition-colors",
                      active
                        ? "bg-flame text-white"
                        : "bg-oat text-espresso hover:bg-oat-dark",
                    )}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-extrabold">Allergies</span>
            <input
              type="text"
              value={allergiesText}
              onChange={(e) => setAllergiesText(e.target.value)}
              placeholder="e.g. peanuts, shellfish — comma separated"
              className={inputClass}
            />
          </label>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-5 rounded-3xl bg-card p-6 ring-1 ring-oat">
          <div>
            <h1 className="text-2xl font-extrabold">Scan your kitchen</h1>
            <p className="mt-1 text-sm font-semibold text-espresso-light">
              Point your camera at your fridge or counter — we&apos;ll list what
              you have so suggestions match your ingredients.
            </p>
          </div>
          <ScanKitchenButton />
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-5 rounded-3xl bg-card p-6 ring-1 ring-oat">
          <div>
            <h1 className="text-2xl font-extrabold">Add your first recipe</h1>
            <p className="mt-1 text-sm font-semibold text-espresso-light">
              Import a recipe you already love — paste text, a link, a photo of
              a recipe card, or a YouTube cooking video.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              finish();
              router.push("/recipes/import");
            }}
          >
            <Link2 className="h-4 w-4" /> Import a recipe
          </Button>
          <p className="text-xs font-semibold text-espresso-light">
            Or finish setup and browse the catalogue for ideas.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        {step > 0 ? (
          <Button variant="outline" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        ) : (
          <span />
        )}
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep(step + 1)}>
            {step === 2 ? "Skip / Continue" : "Continue"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={finish} disabled={pending}>
            {pending ? "Saving…" : "Start cooking"}
          </Button>
        )}
      </div>

      {error && (
        <p className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
