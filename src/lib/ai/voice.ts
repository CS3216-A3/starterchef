"use client";

/**
 * Voice assistant provider configuration. This is separate from the
 * provider-agnostic text/vision layer because native audio models are accessed
 * over WebRTC/WebSocket, not HTTP.
 */

export const VOICE_PROVIDERS = ["web-speech", "openai", "gemini"] as const;
export type VoiceProvider = (typeof VOICE_PROVIDERS)[number];

export function getVoiceProvider(): VoiceProvider {
  const value = process.env.NEXT_PUBLIC_VOICE_PROVIDER ?? "web-speech";
  if (value === "web-speech" || value === "openai" || value === "gemini") {
    return value;
  }
  return "web-speech";
}

export function isVoiceSimulationEnabled(): boolean {
  return process.env.NEXT_PUBLIC_VOICE_SIMULATE === "true";
}

export interface VoiceAssistantMetrics {
  provider: VoiceProvider;
  startedAt: number;
  connectedAt?: number;
  firstResponseAt?: number;
  endedAt?: number;
  error?: string;
  audioInputSeconds?: number;
  audioOutputSeconds?: number;
}

export type VoiceAssistantState =
  | { status: "idle" }
  | { status: "connecting" }
  | { status: "listening" }
  | { status: "processing" }
  | { status: "speaking"; transcript?: string }
  | { status: "error"; message: string };

export interface VoiceSessionConfig {
  provider: VoiceProvider;
  recipeTitle: string;
  stepTitle: string;
}
