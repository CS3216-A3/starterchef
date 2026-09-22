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
  recipeId,
  recipeSlug,
  snapFrame,
  busy,
  onAction,
}: {
  recipeTitle: string;
  stepTitle: string;
  sessionId?: string;
  stepIndex?: number;
  instruction?: string;
  photoCheckpoint?: string;
  recipeId?: string;
  recipeSlug?: string;
  snapFrame?: () => string | null;
  /** A camera check is processing — show thinking and block a second ask. */
  busy?: boolean;
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
        recipeId={recipeId}
        recipeSlug={recipeSlug}
        snapFrame={snapFrame}
        busy={busy}
        onAction={onAction}
      />
    );
  }

  return (
    <RealtimeAssistantButton recipeTitle={recipeTitle} stepTitle={stepTitle} />
  );
}
