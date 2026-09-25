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
  const attempt = useRef<string | null>(null);

  const stop = useCallback(
    (reason: "user" | "expired" | "connection_lost" | "failed" = "user") => {
      const closingAttempt = attempt.current;
      attempt.current = null;
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
      setState(
        reason === "user"
          ? { status: "idle" }
          : {
              status: "error",
              message: "Live voice ended. Use the text assistant below.",
            },
      );
      if (closingAttempt)
        void fetch("/api/ai/realtime-sessions/closed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            attemptId: closingAttempt,
            reason,
          }),
          keepalive: true,
        }).catch(() => undefined);
      logMetrics(metrics.current);
    },
    [sessionId],
  );

  const start = useCallback(async () => {
    if (active.current) return;
    active.current = true;
    setState({ status: "connecting" });
    setTranscript(undefined);
    metrics.current = createMetrics("openai");
    const controller = new AbortController();
    pending.current = controller;
    const attemptId = crypto.randomUUID();
    attempt.current = attemptId;
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
          () => stop("connection_lost"),
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
            () => stop("connection_lost"),
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
            () => stop("connection_lost"),
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
      const serverDeadline = Date.parse(String(config.sessionDeadlineAt));
      const remaining = Number.isFinite(serverDeadline)
        ? Math.max(0, serverDeadline - Date.now())
        : 0;
      expiry.current = window.setTimeout(() => stop("expired"), remaining);
      heartbeat.current = window.setInterval(() => {
        void fetch(`/api/cooking-sessions/${sessionId}`, { cache: "no-store" })
          .then(async (response) => {
            const body = await response.json().catch(() => null);
            if (!response.ok || body?.status !== "in_progress")
              stop("connection_lost");
          })
          .catch(() => undefined);
      }, 15_000);
    } catch {
      if (controller.signal.aborted) return;
      pending.current = null;
      stop("failed");
    }
  }, [sessionId, stop, onAction]);

  useEffect(() => () => stop(), [stop]);
  return { state, transcript, start, stop: () => stop() };
}
