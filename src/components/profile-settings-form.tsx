"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/button";
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
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
] as const;

const inputClass =
  "h-11 w-full rounded-full border-2 border-oat bg-cream px-4 text-sm font-semibold outline-none placeholder:text-espresso-light/60 focus:border-flame";

/**
 * Post-signup profile form — dietary restrictions, allergies, skill level,
 * household size. Saves to public.profiles via the updateProfile action.
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
  const [allergiesText, setAllergiesText] = useState(
    (profile?.allergies ?? []).join(", "),
  );
  const [skillLevel, setSkillLevel] = useState(
    profile?.skill_level ?? "beginner",
  );
  const [householdSize, setHouseholdSize] = useState(
    profile?.household_size ?? 1,
  );
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();

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
        allergies: allergiesText.split(","),
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
      setStatus("saved");
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-6 rounded-3xl bg-card p-6 shadow-sm ring-1 ring-oat"
    >
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

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-extrabold">Skill level</span>
          <select
            value={skillLevel}
            onChange={(e) =>
              setSkillLevel(e.target.value as ProfileRow["skill_level"])
            }
            className={inputClass}
          >
            {SKILL_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-extrabold">Household size</span>
          <input
            type="number"
            min={1}
            max={20}
            value={householdSize}
            onChange={(e) => setHouseholdSize(Number(e.target.value))}
            className={inputClass}
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="md" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
        {status === "saved" && (
          <span className="text-sm font-bold text-green-700">Saved!</span>
        )}
        {status === "error" && (
          <span className="text-sm font-bold text-red-700">
            Couldn&apos;t save — try again.
          </span>
        )}
      </div>
    </form>
  );
}
