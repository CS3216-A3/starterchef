"use client";

import { AskAssistantButton } from "@/components/ask-assistant-button";
import { RealtimeAssistantButton } from "@/components/realtime-assistant-button";
import { getVoiceProvider } from "@/lib/ai/voice";

export function VoiceAssistantButton({
  recipeTitle,
  stepTitle,
  sessionId,
  stepIndex,
}: {
  recipeTitle: string;
  stepTitle: string;
  sessionId?: string;
  stepIndex?: number;
}) {
  const provider = getVoiceProvider();

  if (provider === "web-speech") {
    return (
      <AskAssistantButton
        recipeTitle={recipeTitle}
        stepTitle={stepTitle}
        sessionId={sessionId}
        stepIndex={stepIndex}
      />
    );
  }

  return (
    <RealtimeAssistantButton recipeTitle={recipeTitle} stepTitle={stepTitle} />
  );
}
