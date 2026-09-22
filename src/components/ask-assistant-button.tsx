"use client";

import { Mic, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { createMetrics, logMetrics } from "@/lib/ai/voice-metrics";
import type { VoiceAssistantMetrics } from "@/lib/ai/voice";
import type { AssistantReply } from "@/lib/ai/schemas/assistant";

type AskState =
  | { status: "idle" }
  | { status: "listening" }
  | { status: "thinking" }
  | { status: "answered"; answer: string }
  | { status: "error"; message: string };

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: (event: {
    results: { [i: number]: { [j: number]: { transcript: string } } };
  }) => void;
  onerror: (event: { error: string }) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-SG";
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
}

function stopSpeaking() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

export function AskAssistantButton({
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
  /** Extra context passed to step-check when a camera frame is attached. */
  instruction?: string;
  photoCheckpoint?: string;
  /** "Show and ask": returns a camera frame to send with the question. */
  snapFrame?: () => string | null;
  /** Structured intent from the assistant (set-timer, goto-step…). */
  onAction?: (action: NonNullable<AssistantReply["action"]>) => void;
}) {
  const [state, setState] = useState<AskState>({ status: "idle" });
  const metricsRef = useRef<VoiceAssistantMetrics>(createMetrics("web-speech"));

  useEffect(() => {
    return () => {
      stopSpeaking();
      logMetrics(metricsRef.current);
    };
  }, []);

  async function ask(question: string) {
    setState({ status: "thinking" });
    try {
      const frame = snapFrame?.() ?? null;
      const res = await fetch(
        frame ? "/api/ai/step-check" : "/api/ai/assistant",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            frame
              ? {
                  image: frame,
                  question,
                  context: {
                    recipeTitle,
                    stepTitle,
                    instruction: instruction ?? stepTitle,
                    photoCheckpoint,
                  },
                  sessionId,
                  stepIndex,
                }
              : {
                  question,
                  context: { recipeTitle, stepTitle },
                  sessionId,
                  stepIndex,
                  channel: "voice",
                },
          ),
        },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Assistant failed");

      metricsRef.current.firstResponseAt ??= performance.now();
      // step-check returns {feedback}; assistant returns {answer, action?}.
      const answer = frame ? body.feedback : body.answer;
      if (!frame && body.action) onAction?.(body.action);
      setState({ status: "answered", answer });
      speak(answer);
    } catch (err) {
      metricsRef.current.error =
        err instanceof Error ? err.message : "Assistant failed";
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Something went wrong",
      });
    }
  }

  function handleTap() {
    stopSpeaking();
    metricsRef.current = createMetrics("web-speech");

    const Recognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      void ask("What should I watch out for in this step?");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "en-SG";
    recognition.interimResults = false;
    setState({ status: "listening" });
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      void ask(transcript);
    };
    recognition.onerror = (event) => {
      metricsRef.current.error = event.error;
      setState({ status: "error", message: event.error });
    };
    recognition.onend = () =>
      setState((s) => (s.status === "listening" ? { status: "idle" } : s));
    recognition.start();
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleTap}
        aria-label="Ask StarterChef"
        className={cn(
          "flex h-16 w-16 items-center justify-center rounded-full transition-colors",
          state.status === "listening"
            ? "bg-flame-dark"
            : "bg-flame hover:bg-flame-dark",
        )}
      >
        <Mic className="h-7 w-7 text-white" />
      </button>
      <p className="inline-flex items-center gap-1.5 text-sm font-extrabold">
        Ask StarterChef <Sparkles className="h-3.5 w-3.5 text-flame" />
      </p>
      <p className="text-xs font-semibold text-espresso-light">
        {state.status === "listening"
          ? "Listening…"
          : state.status === "thinking"
            ? "Thinking…"
            : state.status === "answered"
              ? "Speaking…"
              : "Tap to speak"}
      </p>
      {state.status === "answered" && (
        <p className="max-w-xs rounded-2xl bg-oat p-3 text-center text-sm font-semibold">
          {state.answer}
        </p>
      )}
      {state.status === "error" && (
        <p className="text-xs font-semibold text-flame-dark">{state.message}</p>
      )}
    </div>
  );
}
