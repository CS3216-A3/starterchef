"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/button";
import { trackEvent } from "@/lib/posthog/events";

/**
 * "Let's cook" / "View recipe" CTA. Creates (or reuses) an in-progress
 * cooking_sessions row, then navigates to the cook screen.
 */
export function StartCookingButton({
  recipeId,
  primary,
  label,
}: {
  recipeId: string;
  primary?: boolean;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    trackEvent("recipe_selected", {
      recipe_id: recipeId,
      source: "cook_button",
    });
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/cooking-sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipeId }),
        });
        const body = await response.json().catch(() => null);
        const sessionId = body?.session?.id;
        if (!response.ok || typeof sessionId !== "string") {
          setError("Could not start cooking. Please try again.");
          return;
        }
        trackEvent("cooking_session_started", { recipe_id: recipeId });
        router.push(`/cook/${sessionId}?prep`);
      } catch {
        setError("Could not connect. Please try again.");
      }
    });
  }
  return (
    <div className="w-full">
      <Button
        variant={primary ? "primary" : "outline"}
        size="sm"
        className="w-full"
        disabled={pending}
        onClick={handleClick}
      >
        {pending ? "Starting…" : label}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-flame-ink">
          {error}
        </p>
      )}
    </div>
  );
}
