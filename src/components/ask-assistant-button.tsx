"use client";

import { Mic } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

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

export function AskAssistantButton({
  recipeTitle,
  stepTitle,
}: {
  recipeTitle: string;
  stepTitle: string;
}) {
  const [state, setState] = useState<AskState>({ status: "idle" });

  async function ask(question: string) {
    setState({ status: "thinking" });
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          context: { recipeTitle, stepTitle },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Assistant failed");
      setState({ status: "answered", answer: body.answer });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Something went wrong",
      });
    }
  }

  function handleTap() {
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
    recognition.onerror = (event) =>
      setState({ status: "error", message: event.error });
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
      <p className="text-sm font-extrabold">Ask StarterChef</p>
      <p className="text-xs font-semibold text-espresso-light">
        {state.status === "listening"
          ? "Listening…"
          : state.status === "thinking"
            ? "Thinking…"
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
