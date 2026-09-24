"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/button";
import { trackEvent } from "@/lib/posthog/events";

const RATING_LABELS = ["Very poor", "Poor", "Okay", "Good", "Loved it"];

/** Feedback and completion are scoped to this exact session. AI
 * personalisation deliberately starts a reviewed adaptation draft elsewhere. */
export function FinishForm({
  sessionId,
  version,
  title,
}: {
  sessionId: string;
  version: number;
  title: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rating, setRating] = useState(3);
  const [difficulty, setDifficulty] = useState(3);
  const [wouldMakeAgain, setWouldMakeAgain] = useState<boolean | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const complete = await fetch(
          `/api/cooking-sessions/${sessionId}/complete`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expectedVersion: version }),
          },
        );
        if (complete.status === 409) {
          setError(
            "This session changed in another tab. Refresh and try again.",
          );
          router.refresh();
          return;
        }
        if (!complete.ok) {
          setError("Could not complete this cooking session");
          return;
        }
        const feedback = await fetch(
          `/api/cooking-sessions/${sessionId}/feedback`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              rating,
              wouldMakeAgain,
              perceivedDifficulty: difficulty,
              notes,
            }),
          },
        );
        if (!feedback.ok) {
          setError(
            "Cooking finished, but feedback could not be saved. Refresh this page and try again.",
          );
          return;
        }
        trackEvent("feedback_submitted", {
          session_id: sessionId,
          rating,
        });
        trackEvent("cooking_session_completed", {
          session_id: sessionId,
          rating,
        });
        router.push("/today");
      } catch {
        setError("Could not connect. Please try again.");
      }
    });
  }
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="rounded-3xl bg-card p-4 shadow-sm ring-1 ring-oat">
        <p className="text-base font-extrabold">{title}</p>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label htmlFor="rating" className="text-sm font-extrabold">
            Rating
          </label>
          <span className="text-sm font-extrabold text-flame">
            {rating}/5 · {RATING_LABELS[rating - 1]}
          </span>
        </div>
        <input
          id="rating"
          type="range"
          min={1}
          max={5}
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
          className="w-full accent-flame"
        />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label htmlFor="difficulty" className="text-sm font-extrabold">
            How difficult was it?
          </label>
          <span className="text-sm font-extrabold text-flame">
            {difficulty}/5
          </span>
        </div>
        <input
          id="difficulty"
          type="range"
          min={1}
          max={5}
          value={difficulty}
          onChange={(e) => setDifficulty(Number(e.target.value))}
          className="w-full accent-flame"
        />
      </div>
      <label className="flex flex-col gap-1 text-sm font-extrabold">
        Would you make it again?
        <select
          value={
            wouldMakeAgain === null ? "unsure" : wouldMakeAgain ? "yes" : "no"
          }
          onChange={(e) =>
            setWouldMakeAgain(
              e.target.value === "unsure" ? null : e.target.value === "yes",
            )
          }
          className="rounded-xl border-2 border-espresso/10 bg-card p-2.5 text-sm font-semibold outline-none focus:border-flame"
        >
          <option value="unsure">Not sure</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-extrabold">
        Notes
        <textarea
          value={notes}
          maxLength={2000}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything to remember next time?"
          rows={3}
          className="rounded-xl border-2 border-espresso/10 bg-card p-2.5 text-sm font-semibold outline-none focus:border-flame"
        />
      </label>
      <Button type="submit" size="md" disabled={pending}>
        {pending ? "Saving…" : "Done"}
      </Button>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-oat p-3 text-sm font-bold text-flame"
        >
          {error}
        </p>
      )}
    </form>
  );
}
