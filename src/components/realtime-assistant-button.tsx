"use client";

import { Mic } from "lucide-react";
import { useRealtimeAssistant } from "@/hooks/use-realtime-assistant";
import { cn } from "@/lib/utils";

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
        className={cn(
          "flex h-16 w-16 items-center justify-center rounded-full transition-colors",
          isActive ? "bg-flame-dark" : "bg-flame hover:bg-flame-dark",
        )}
      >
        <Mic className="h-7 w-7 text-white" />
      </button>

      <p className="text-sm font-extrabold">Ask StarterChef</p>
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
