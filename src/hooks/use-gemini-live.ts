"use client";

import type { MutableRefObject } from "react";
import type {
  VoiceAssistantMetrics,
  VoiceAssistantState,
  VoiceSessionConfig,
} from "@/lib/ai/voice";

type StateSetter = React.Dispatch<React.SetStateAction<VoiceAssistantState>>;

/**
 * Connects to Google Gemini Live API via WebSocket.
 *
 * This is a scaffold: it opens the socket and sends the setup message.
 * The audio chunk encoding (PCM16 base64) and playback will need testing with a
 * real key. Gemini Live can also accept video frames on the same stream.
 */
export async function connectGeminiLive(
  config: Record<string, unknown>,
  sessionConfig: VoiceSessionConfig,
  setState: StateSetter,
  setTranscript: (t: string | undefined) => void,
  metricsRef: MutableRefObject<VoiceAssistantMetrics>,
): Promise<() => void> {
  const model = config.model as string;
  const token = config.token;

  if (typeof model !== "string") {
    throw new Error("Invalid Gemini Live config");
  }

  if (typeof token !== "string") {
    throw new Error("Invalid Gemini Live session token");
  }

  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?access_token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(url);

  let cleanup = () => {};

  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => {
      metricsRef.current.connectedAt = performance.now();
      ws.send(
        JSON.stringify({
          setup: {
            generation_config: {
              response_modalities: ["audio"],
              temperature: 0.4,
            },
            system_instruction: {
              parts: [{ text: buildContextText(sessionConfig) }],
            },
          },
        }),
      );
      setState({ status: "listening" });
      resolve();
    };

    ws.onerror = (event) =>
      reject(new Error(`Gemini Live error: ${event.type}`));
    ws.onclose = () => setState({ status: "idle" });
  });

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data) as {
      serverContent?: { modelTurn?: { parts?: { text?: string }[] } };
      error?: { message: string };
    };

    if (data.error) {
      setState({ status: "error", message: data.error.message });
      return;
    }

    const text = data.serverContent?.modelTurn?.parts?.find(
      (p) => p.text,
    )?.text;
    if (text) {
      metricsRef.current.firstResponseAt ??= performance.now();
      setTranscript(text);
      setState({ status: "speaking", transcript: text });
    }
  };

  cleanup = () => {
    ws.close();
  };

  return cleanup;
}

function buildContextText(sessionConfig: VoiceSessionConfig): string {
  return [
    "You are StarterChef, a warm sous-chef helping a beginner cook.",
    `Recipe: ${sessionConfig.recipeTitle}. Current step: ${sessionConfig.stepTitle}.`,
    "Replies must be 1-3 short, encouraging sentences, suitable for speech.",
  ].join(" ");
}
