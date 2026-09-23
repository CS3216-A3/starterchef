"use client";

import type { MutableRefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getVoiceProvider,
  isVoiceSimulationEnabled,
  type VoiceAssistantMetrics,
  type VoiceAssistantState,
  type VoiceSessionConfig,
} from "@/lib/ai/voice";
import { createMetrics, logMetrics } from "@/lib/ai/voice-metrics";
import { connectGeminiLive } from "@/hooks/use-gemini-live";
import { connectOpenAIRealtime } from "@/hooks/use-openai-realtime";

export interface UseRealtimeAssistantOptions {
  recipeTitle: string;
  stepTitle: string;
}

export interface UseRealtimeAssistantReturn {
  state: VoiceAssistantState;
  start: () => Promise<void>;
  stop: () => void;
  transcript?: string;
}

export function useRealtimeAssistant({
  recipeTitle,
  stepTitle,
}: UseRealtimeAssistantOptions): UseRealtimeAssistantReturn {
  const provider = getVoiceProvider();
  const [state, setState] = useState<VoiceAssistantState>({ status: "idle" });
  const [transcript, setTranscript] = useState<string>();
  const metricsRef = useRef(createMetrics(provider));
  const cleanupRef = useRef<(() => void) | undefined>(undefined);

  const stop = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = undefined;
    logMetrics(metricsRef.current);
    setState({ status: "idle" });
  }, [setState]);

  const start = useCallback(async () => {
    if (state.status !== "idle") return;

    metricsRef.current = createMetrics(provider);
    setState({ status: "connecting" });

    if (isVoiceSimulationEnabled()) {
      simulateSession(setState, setTranscript, metricsRef, cleanupRef);
      return;
    }

    try {
      const res = await fetch("/api/ai/realtime/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capability: "cooking-assistant" }),
      });
      const config = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new Error(String(config.error ?? "Session failed"));
      const sessionProvider = config.provider;
      if (sessionProvider !== "openai" && sessionProvider !== "gemini") {
        throw new Error("Invalid realtime session provider");
      }

      const sessionConfig: VoiceSessionConfig = {
        provider: sessionProvider,
        recipeTitle,
        stepTitle,
      };

      const cleanup =
        sessionProvider === "openai"
          ? await connectOpenAIRealtime(
              config,
              sessionConfig,
              setState,
              setTranscript,
              metricsRef,
            )
          : await connectGeminiLive(
              config,
              sessionConfig,
              setState,
              setTranscript,
              metricsRef,
            );

      cleanupRef.current = () => {
        cleanup();
        cleanupRef.current = undefined;
      };
    } catch (err) {
      metricsRef.current.error =
        err instanceof Error ? err.message : "Connection failed";
      setState({
        status: "error",
        message: metricsRef.current.error,
      });
      logMetrics(metricsRef.current);
    }
  }, [provider, recipeTitle, setState, setTranscript, state.status, stepTitle]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { state, start, stop, transcript };
}

function simulateSession(
  setState: React.Dispatch<React.SetStateAction<VoiceAssistantState>>,
  setTranscript: React.Dispatch<React.SetStateAction<string | undefined>>,
  metricsRef: MutableRefObject<VoiceAssistantMetrics>,
  cleanupRef: MutableRefObject<(() => void) | undefined>,
) {
  const steps = [
    () => setState({ status: "connecting" }),
    () => {
      metricsRef.current.connectedAt = performance.now();
      setState({ status: "listening" });
    },
    () => {
      metricsRef.current.firstResponseAt = performance.now();
      setState({ status: "processing" });
    },
    () => {
      const text = "Let it cook for one more minute, then flip.";
      setTranscript(`Simulated: ${text}`);
      setState({ status: "speaking", transcript: text });
    },
  ];

  const timers: number[] = [];
  steps.forEach((step, idx) => {
    timers.push(window.setTimeout(step, (idx + 1) * 800));
  });

  cleanupRef.current = () => {
    timers.forEach((t) => window.clearTimeout(t));
  };
}
