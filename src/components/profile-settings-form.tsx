"use client";

import { Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/button";
import { PillInput } from "@/components/pill-input";
import { updateProfile } from "@/app/(app)/settings/actions";
import { trackEvent } from "@/lib/posthog/events";
import type { ProfileRow } from "@/lib/types";
import { cn } from "@/lib/utils";

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
  {
    value: "beginner",
    label: "Beginner",
    blurb: "I'm learning the basics",
  },
  {
    value: "intermediate",
    label: "Intermediate",
    blurb: "I can follow most recipes",
  },
  {
    value: "advanced",
    label: "Advanced",
    blurb: "I cook without a recipe",
  },
] as const;

const inputClass =
  "h-11 w-full rounded-full border-2 border-oat bg-cream px-4 text-sm font-semibold outline-none placeholder:text-espresso-light/60 focus:border-flame";

/**
 * Profile editor — the info StarterChef's AI uses to personalise recipes:
 * who you are, dietary needs, allergies, skill and household size.
 */
export function ProfileSettingsForm({
  profile,
}: {
  profile: ProfileRow | null;
}) {
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [restrictions, setRestrictions] = useState<string[]>(
    profile?.dietary_restrictions ?? [],
  );
  const [allergies, setAllergies] = useState<string[]>(
    profile?.allergies ?? [],
  );
  const [skillLevel, setSkillLevel] = useState(
    profile?.skill_level ?? "beginner",
  );
  const [householdSize, setHouseholdSize] = useState(
    profile?.household_size ?? 1,
  );
  const [status, setStatus] = useState<"idle" | "error">("idle");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggleRestriction(option: string) {
    setRestrictions((prev) =>
      prev.includes(option)
        ? prev.filter((r) => r !== option)
        : [...prev, option],
    );
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const res = await updateProfile({
        displayName,
        dietaryRestrictions: restrictions,
        allergies,
        skillLevel: skillLevel as ProfileRow["skill_level"],
        householdSize,
      }).catch(() => ({ error: "Save failed" }));
      if ("error" in res && res.error) {
        setStatus("error");
        return;
      }
      trackEvent("profile_updated", {
        dietary_restrictions: restrictions.length,
        skill_level: skillLevel,
      });
      router.push("/settings");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <section className="flex flex-col gap-5 rounded-3xl bg-card p-6 shadow-sm ring-1 ring-oat">
        <div>
          <h2 className="text-lg font-extrabold">About you</h2>
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-extrabold">Display name</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="What should we call you?"
            className={inputClass}
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-extrabold">Household size</span>
          <div className="inline-flex w-fit items-center gap-3 rounded-full border-2 border-oat bg-cream px-2 py-1.5">
            <button
              type="button"
              onClick={() => setHouseholdSize((n) => Math.max(1, n - 1))}
              aria-label="Fewer people"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-oat text-espresso hover:bg-oat-dark"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="min-w-16 text-center text-sm font-extrabold">
              {householdSize} {householdSize === 1 ? "person" : "people"}
            </span>
            <button
              type="button"
              onClick={() => setHouseholdSize((n) => Math.min(20, n + 1))}
              aria-label="More people"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-oat text-espresso hover:bg-oat-dark"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-extrabold">Skill level</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {SKILL_OPTIONS.map(({ value, label, blurb }) => {
              const active = skillLevel === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSkillLevel(value)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-2xl border-2 p-3 text-left transition-colors",
                    active
                      ? "border-flame bg-flame-soft"
                      : "border-oat bg-cream hover:border-oat-dark",
                  )}
                >
                  <span className="block text-sm font-extrabold">{label}</span>
                  <span className="block text-xs font-semibold text-espresso-light">
                    {blurb}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      </section>

      <section className="flex flex-col gap-5 rounded-3xl bg-card p-6 shadow-sm ring-1 ring-oat">
        <div>
          <h2 className="text-lg font-extrabold">Diet & allergies</h2>
          <p className="text-sm font-semibold text-espresso-light">
            StarterChef will take note of these needs when customising recipes
            for you.
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
                      ? "bg-flame text-espresso"
                      : "bg-oat text-espresso hover:bg-oat-dark",
                  )}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-extrabold">Allergies</span>
          <PillInput
            values={allergies}
            onChange={setAllergies}
            placeholder="Type an allergy and press Enter, e.g. peanuts"
          />
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" size="md" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
        <Link
          href="/settings"
          className="inline-flex h-11 items-center rounded-full px-6 font-bold text-espresso-light transition-colors hover:bg-oat/60 hover:text-espresso"
        >
          Cancel
        </Link>
        {status === "error" && (
          <span className="text-sm font-bold text-red-700">
            Couldn&apos;t save. Try again.
          </span>
        )}
      </div>
    </form>
  );
}
