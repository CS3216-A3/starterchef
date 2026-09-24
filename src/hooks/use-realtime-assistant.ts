"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { connectGeminiLive } from "@/hooks/use-gemini-live";
import { connectOpenAIRealtime } from "@/hooks/use-openai-realtime";
import { createMetrics, logMetrics } from "@/lib/ai/voice-metrics";
import type { VoiceAssistantState } from "@/lib/ai/voice";
import type { AssistantReply } from "@/lib/ai/schemas/assistant";

export function useRealtimeAssistant({
  sessionId,
  onAction,
}: {
  sessionId: string;
  onAction?: (action: NonNullable<AssistantReply["action"]>) => void;
}) {
  const [state, setState] = useState<VoiceAssistantState>({ status: "idle" });
  const [transcript, setTranscript] = useState<string>();
  const metrics = useRef(createMetrics("openai"));
  const cleanup = useRef<(() => void) | null>(null);
  const pending = useRef<AbortController | null>(null);
  const expiry = useRef<number | null>(null);
  const heartbeat = useRef<number | null>(null);
  const active = useRef(false);

  const stop = useCallback(() => {
    active.current = false;
    pending.current?.abort();
    pending.current = null;
    if (expiry.current !== null) window.clearTimeout(expiry.current);
    if (heartbeat.current !== null) window.clearInterval(heartbeat.current);
    expiry.current = null;
    heartbeat.current = null;
    cleanup.current?.();
    cleanup.current = null;
    setTranscript(undefined);
    setState({ status: "idle" });
    logMetrics(metrics.current);
  }, []);

  const start = useCallback(async () => {
    if (active.current) return;
    active.current = true;
    setState({ status: "connecting" });
    setTranscript(undefined);
    metrics.current = createMetrics("openai");
    const controller = new AbortController();
    pending.current = controller;
    const attemptId = crypto.randomUUID();
    const credential = async (fallbackFrom: "openai" | null) => {
      const response = await fetch("/api/ai/realtime-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, attemptId, fallbackFrom }),
      });
      const body = (await response.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      if (!response.ok || !body) throw new Error("Live voice is unavailable");
      return body;
    };
    const markConnected = async () => {
      const response = await fetch("/api/ai/realtime-sessions/connected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, attemptId }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Realtime attempt expired");
    };
    try {
      let config = await credential(null);
      if (!active.current) return;
      if (config.provider === "gemini") {
        metrics.current.provider = "gemini";
        cleanup.current = await connectGeminiLive(
          config,
          setState,
          setTranscript,
          metrics,
          onAction,
          controller.signal,
          stop,
          markConnected,
        );
      } else if (config.provider === "openai") {
        try {
          cleanup.current = await connectOpenAIRealtime(
            config,
            setState,
            setTranscript,
            metrics,
            onAction,
            controller.signal,
            stop,
            markConnected,
          );
        } catch {
          if (!active.current) return;
          config = await credential("openai");
          if (config.provider !== "gemini")
            throw new Error("Fallback unavailable");
          metrics.current.provider = "gemini";
          cleanup.current = await connectGeminiLive(
            config,
            setState,
            setTranscript,
            metrics,
            onAction,
            controller.signal,
            stop,
            markConnected,
          );
        }
      } else {
        throw new Error("Unsupported realtime provider");
      }
      if (!active.current) {
        cleanup.current?.();
        cleanup.current = null;
        return;
      }
      pending.current = null;
      expiry.current = window.setTimeout(stop, 15 * 60_000);
      heartbeat.current = window.setInterval(() => {
        void fetch(`/api/cooking-sessions/${sessionId}`, { cache: "no-store" })
          .then(async (response) => {
            const body = await response.json().catch(() => null);
            if (!response.ok || body?.status !== "in_progress") stop();
          })
          .catch(() => undefined);
      }, 15_000);
    } catch {
      if (controller.signal.aborted) return;
      pending.current = null;
      cleanup.current?.();
      cleanup.current = null;
      active.current = false;
      setState({
        status: "error",
        message: "Live voice is unavailable. Use the text assistant below.",
      });
      setTranscript(undefined);
    }
  }, [sessionId, stop, onAction]);

  useEffect(() => stop, [stop]);
  return { state, transcript, start, stop };
}
