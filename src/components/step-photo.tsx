"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { removeStepPhoto } from "@/app/(app)/cook/[id]/actions";

/**
 * Checkpoint photo shown on a step, with a remove affordance. Removing only
 * clears the photo from the step display — the session_events timeline keeps
 * the original record.
 */
export function StepPhoto({
  recipeSlug,
  stepIndex,
  photoUrl,
  className = "h-24 w-36",
}: {
  recipeSlug: string;
  stepIndex: number;
  photoUrl: string;
  className?: string;
}) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);

  const onRemove = async () => {
    setRemoving(true);
    await removeStepPhoto({ recipeSlug, stepIndex });
    router.refresh();
  };

  return (
    <span className={`relative inline-block ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded */}
      <img
        src={photoUrl}
        alt={`Your photo of step ${stepIndex}`}
        className="h-full w-full rounded-2xl object-cover ring-1 ring-oat"
      />
      <button
        type="button"
        onClick={onRemove}
        disabled={removing}
        aria-label="Remove this photo from the step"
        className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-espresso text-cream shadow-sm transition-opacity hover:opacity-80 disabled:opacity-40"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
    </span>
  );
}
