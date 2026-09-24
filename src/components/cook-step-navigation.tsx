"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/button";

export function CookStepNavigation({
  sessionId,
  currentStep,
  totalSteps,
  version,
}: {
  sessionId: string;
  currentStep: number;
  totalSteps: number;
  version: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function move(step: number) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/cooking-sessions/${sessionId}/progress`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currentStep: step, expectedVersion: version }),
        },
      );
      if (response.status === 409) {
        setError(
          "This session changed in another tab. Reloaded the latest step.",
        );
        router.refresh();
        return;
      }
      if (!response.ok) throw new Error("Could not save progress");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save progress",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <nav className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        {currentStep > 1 ? (
          <Button
            variant="outline"
            size="md"
            disabled={busy}
            onClick={() => void move(currentStep - 1)}
          >
            <ArrowLeft className="h-4 w-4" /> Previous
          </Button>
        ) : (
          <span />
        )}
        {currentStep < totalSteps ? (
          <Button
            size="md"
            disabled={busy}
            onClick={() => void move(currentStep + 1)}
          >
            Done, next step <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            size="md"
            disabled={busy}
            onClick={() => router.push(`/cook/${sessionId}/finish`)}
          >
            Finish cooking <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
      {error && <p className="text-xs font-bold text-flame">{error}</p>}
    </nav>
  );
}
