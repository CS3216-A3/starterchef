"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clientErrorMessage } from "@/lib/client-error";

/**
 * Checkpoint photo shown on a step, with a remove affordance. Removing only
 * clears the photo from the step display — the session_events timeline keeps
 * the original photo_check record.
 */
export function StepPhoto({
  sessionId,
  checkpointId,
  photoUrl,
  className = "h-24 w-36",
}: {
  sessionId: string;
  checkpointId: string;
  photoUrl: string;
  className?: string;
}) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onRemove = async () => {
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/cooking-sessions/${sessionId}/checkpoints?checkpointId=${checkpointId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(clientErrorMessage(body, "Could not remove photo"));
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove photo");
      setRemoving(false);
    }
  };

  return (
    <span className="inline-block">
      <span className={`relative inline-block ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded */}
        <img
          src={photoUrl}
          alt="Your checkpoint photo of this step"
          className="h-full w-full rounded-2xl object-cover ring-1 ring-oat"
        />
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          aria-label="Remove this photo from the step; the check result stays in your timeline"
          className="absolute -top-2 -right-2 flex h-10 w-10 items-center justify-center rounded-full bg-espresso text-cream shadow-sm transition-opacity hover:opacity-80 disabled:opacity-40"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </span>
      <span className="mt-1 block text-xs font-semibold text-espresso-light">
        Removing the photo keeps the check result in your cooking timeline.
      </span>
      {error && <p className="mt-1 text-xs font-bold text-flame">{error}</p>}
    </span>
  );
}
