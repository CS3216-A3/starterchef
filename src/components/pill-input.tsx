"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Tag-style input: type + Enter/comma adds a removable pill. Used for
 * allergies on onboarding and the profile page.
 */
export function PillInput({
  values,
  onChange,
  placeholder,
  inputClassName,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  inputClassName?: string;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const value = draft.trim().replace(/,$/, "");
    if (value && !values.includes(value)) onChange([...values, value]);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-2">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {values.map((value) => (
            <span
              key={value}
              className="inline-flex items-center gap-1.5 rounded-full bg-flame-soft px-3 py-1.5 text-sm font-bold"
            >
              {value}
              <button
                type="button"
                onClick={() => onChange(values.filter((v) => v !== value))}
                aria-label={`Remove ${value}`}
                className="text-espresso-light hover:text-flame"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== ",") return;
          e.preventDefault();
          commit();
        }}
        onBlur={commit}
        placeholder={placeholder}
        className={cn(
          "h-11 w-full rounded-full border-2 border-oat bg-cream px-4 text-sm font-semibold outline-none placeholder:text-espresso-light/60 focus:border-flame",
          inputClassName,
        )}
      />
    </div>
  );
}
