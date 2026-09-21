"use client";

import { AskAssistantButton } from "@/components/ask-assistant-button";
import { RealtimeAssistantButton } from "@/components/realtime-assistant-button";
import { getVoiceProvider } from "@/lib/ai/voice";

export function VoiceAssistantButton({
  recipeTitle,
  stepTitle,
}: {
  recipeTitle: string;
  stepTitle: string;
}) {
  const provider = getVoiceProvider();

  if (provider === "web-speech") {
    return (
      <AskAssistantButton recipeTitle={recipeTitle} stepTitle={stepTitle} />
    );
  }

  return (
    <RealtimeAssistantButton recipeTitle={recipeTitle} stepTitle={stepTitle} />
  );
}
