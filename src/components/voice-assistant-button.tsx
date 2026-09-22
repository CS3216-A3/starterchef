"use client";

import { AskAssistantButton } from "@/components/ask-assistant-button";
import { RealtimeAssistantButton } from "@/components/realtime-assistant-button";
import type { AssistantReply } from "@/lib/ai/schemas/assistant";
import { getVoiceProvider } from "@/lib/ai/voice";

export function VoiceAssistantButton({
  recipeTitle,
  stepTitle,
  sessionId,
  stepIndex,
  instruction,
  photoCheckpoint,
  snapFrame,
  onAction,
}: {
  recipeTitle: string;
  stepTitle: string;
  sessionId?: string;
  stepIndex?: number;
  instruction?: string;
  photoCheckpoint?: string;
  snapFrame?: () => string | null;
  onAction?: (action: NonNullable<AssistantReply["action"]>) => void;
}) {
  const provider = getVoiceProvider();

  if (provider === "web-speech") {
    return (
      <AskAssistantButton
        recipeTitle={recipeTitle}
        stepTitle={stepTitle}
        sessionId={sessionId}
        stepIndex={stepIndex}
        instruction={instruction}
        photoCheckpoint={photoCheckpoint}
        snapFrame={snapFrame}
        onAction={onAction}
      />
    );
  }

  return (
    <RealtimeAssistantButton recipeTitle={recipeTitle} stepTitle={stepTitle} />
  );
}
