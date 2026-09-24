"use client";

import { AskAssistantButton } from "@/components/ask-assistant-button";
import { RealtimeAssistantButton } from "@/components/realtime-assistant-button";
import type { AssistantReply } from "@/lib/ai/schemas/assistant";
import { getVoiceProvider } from "@/lib/ai/voice";

export function VoiceAssistantButton({
  sessionId,
  busy,
  onAction,
}: {
  sessionId: string;
  /** A camera check is processing — show thinking and block a second ask. */
  busy?: boolean;
  onAction?: (action: NonNullable<AssistantReply["action"]>) => void;
}) {
  const provider = getVoiceProvider();

  if (provider === "web-speech") {
    return (
      <AskAssistantButton
        sessionId={sessionId}
        busy={busy}
        onAction={onAction}
      />
    );
  }

  return <RealtimeAssistantButton sessionId={sessionId} onAction={onAction} />;
}
