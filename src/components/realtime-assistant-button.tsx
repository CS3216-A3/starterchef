"use client";

import { Sparkles } from "lucide-react";
import { ChefBuddy } from "@/components/chef-buddy";
import { useRealtimeAssistant } from "@/hooks/use-realtime-assistant";

export function RealtimeAssistantButton({
  recipeTitle,
  stepTitle,
}: {
  recipeTitle: string;
  stepTitle: string;
}) {
  const { state, start, stop, transcript } = useRealtimeAssistant({
    recipeTitle,
    stepTitle,
  });

  const isActive = state.status !== "idle" && state.status !== "error";

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        aria-label="Ask StarterChef"
        onClick={isActive ? stop : start}
        className="rounded-full transition-transform hover:scale-105"
      >
        <ChefBuddy
          state={
            state.status === "listening"
              ? "listening"
              : state.status === "speaking"
                ? "speaking"
                : state.status === "connecting" || state.status === "processing"
                  ? "thinking"
                  : "idle"
          }
        />
      </button>

      <p className="inline-flex items-center gap-1.5 text-sm font-extrabold">
        Ask StarterChef <Sparkles className="h-3.5 w-3.5 text-flame" />
      </p>
      <p className="text-xs font-semibold text-espresso-light">
        {state.status === "connecting" && "Connecting…"}
        {state.status === "listening" && "Listening…"}
        {state.status === "processing" && "Thinking…"}
        {state.status === "speaking" && "Speaking…"}
        {state.status === "idle" && "Tap to speak"}
        {state.status === "error" && "Tap to retry"}
      </p>

      {transcript && state.status !== "idle" && (
        <p className="max-w-xs rounded-2xl bg-oat p-3 text-center text-sm font-semibold">
          {transcript}
        </p>
      )}

      {state.status === "error" && (
        <p className="text-xs font-semibold text-flame-dark">{state.message}</p>
      )}
    </div>
  );
}
