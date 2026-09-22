"use client";

import { Mic, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveKitchenItems } from "@/app/(app)/kitchen/actions";
import type { KitchenVoiceResult } from "@/lib/ai/schemas/kitchen-scan";
import { cn } from "@/lib/utils";

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

type VoiceState =
  | { status: "idle" }
  | { status: "listening" }
  | { status: "parsing" }
  | { status: "error"; message: string };

/**
 * "Add by voice" — dictate items ("two tomatoes and a frying pan"), the
 * kitchen-voice route parses them, saveKitchenItems merges them in.
 * Sits next to the manual add form on /kitchen.
 */
export function VoiceAddItems() {
  const router = useRouter();
  const [state, setState] = useState<VoiceState>({ status: "idle" });
  const [pending, startTransition] = useTransition();

  async function parseAndSave(transcript: string) {
    setState({ status: "parsing" });
    try {
      const res = await fetch("/api/ai/kitchen-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const body = (await res.json().catch(() => null)) as
        (KitchenVoiceResult & { error?: string }) | null;
      if (!res.ok || !body) {
        throw new Error(body?.error ?? "Couldn't parse that");
      }
      if (body.items.length === 0) {
        setState({
          status: "error",
          message: "Didn't catch any items — try again?",
        });
        return;
      }
      startTransition(async () => {
        const result = await saveKitchenItems(
          body.items.map((item) => ({
            kind: item.kind,
            name: item.name,
            quantity: item.quantity,
            icon: item.icon,
            source: "manual",
          })),
        );
        if ("error" in result && result.error) {
          setState({ status: "error", message: result.error });
          return;
        }
        setState({ status: "idle" });
        router.refresh();
      });
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
      setState({
        status: "error",
        message: "Voice input isn't supported in this browser",
      });
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "en-SG";
    recognition.interimResults = false;
    setState({ status: "listening" });
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      void parseAndSave(transcript);
    };
    recognition.onerror = (event) => {
      setState({ status: "error", message: event.error });
    };
    recognition.onend = () =>
      setState((s) => (s.status === "listening" ? { status: "idle" } : s));
    recognition.start();
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleTap}
        disabled={pending || state.status === "parsing"}
        aria-label="Add items by voice"
        className={cn(
          "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold text-white transition-colors",
          state.status === "listening"
            ? "bg-flame-dark"
            : "bg-flame hover:bg-flame-dark",
        )}
      >
        <Mic className="h-4 w-4" />
        {state.status === "listening"
          ? "Listening…"
          : state.status === "parsing"
            ? "Adding…"
            : "Add by voice"}
        {state.status === "idle" && <Sparkles className="h-3.5 w-3.5" />}
      </button>
      {state.status === "listening" && (
        <p className="text-xs font-semibold text-espresso-light">
          e.g. “two tomatoes and a frying pan”
        </p>
      )}
      {state.status === "error" && (
        <p className="text-xs font-bold text-red-700">{state.message}</p>
      )}
    </div>
  );
}
