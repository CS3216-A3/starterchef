import type { VoiceAssistantMetrics, VoiceProvider } from "@/lib/ai/voice";

/**
 * Simple metrics collector for voice assistant sessions. Logs to console as
 * JSON for now; later persist to Supabase `ai_calls` via an endpoint.
 */

export function createMetrics(provider: VoiceProvider): VoiceAssistantMetrics {
  return { provider, startedAt: performance.now() };
}

export function logMetrics(metrics: VoiceAssistantMetrics) {
  metrics.endedAt ??= performance.now();
  const durationMs = metrics.endedAt - metrics.startedAt;

  console.info(
    JSON.stringify({
      event: "voice_session",
      provider: metrics.provider,
      durationMs,
      connectedAt: metrics.connectedAt,
      firstResponseAt: metrics.firstResponseAt,
      audioInputSeconds: metrics.audioInputSeconds,
      audioOutputSeconds: metrics.audioOutputSeconds,
      error: metrics.error,
    }),
  );
}
