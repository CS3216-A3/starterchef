"use client";

import { useEffect } from "react";
import { recordStepEvent } from "@/app/(app)/cook/[id]/actions";

/**
 * Invisible component that records a `step_entered` session event each time
 * the user lands on a new step. Renders nothing.
 */
export function StepTracker({
  sessionId,
  stepIndex,
}: {
  sessionId: string;
  stepIndex: number;
}) {
  useEffect(() => {
    void recordStepEvent(sessionId, stepIndex).catch(() => undefined);
  }, [sessionId, stepIndex]);

  return null;
}
