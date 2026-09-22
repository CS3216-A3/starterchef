"use client";

import { useRef, useState } from "react";
import { Camera, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/button";
import type { AssistantReply } from "@/lib/ai/schemas/assistant";
import type { StepCheck } from "@/lib/ai/schemas/cooking";

interface StepContext {
  recipeTitle: string;
  stepTitle: string;
  instruction: string;
  photoCheckpoint?: string;
  /** Enables persisting checkpoint photos onto the step. */
  recipeId?: string;
  recipeSlug?: string;
}

interface SessionLink {
  /** When provided, interactions are recorded on the session timeline. */
  sessionId?: string;
  stepIndex?: number;
}

/**
 * Camera checkpoint: photograph the food mid-step and get practical
 * feedback on whether it looks right.
 */
export function StepCheckButton({
  context,
  sessionId,
  stepIndex,
}: {
  context: StepContext;
} & SessionLink) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StepCheck | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => void checkPhoto(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function checkPhoto(dataUrl: string) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ai/step-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: dataUrl,
          context,
          sessionId,
          stepIndex,
          recipeId: context.recipeId,
          recipeSlug: context.recipeSlug,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Check failed");
      setResult(body as StepCheck);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />
      <Button
        variant="secondary"
        size="sm"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
      >
        <Camera className="h-4 w-4" />
        {loading ? "Checking…" : "Check my progress with a photo"}
        {!loading && <Sparkles className="h-3.5 w-3.5" />}
      </Button>
      {result && (
        <div className="rounded-2xl bg-oat p-3">
          <p className="text-sm font-extrabold">
            {result.looksRight === true
              ? "Looks good ✓"
              : result.looksRight === false
                ? "Needs a small fix"
                : "Can't quite tell"}
          </p>
          <p className="text-sm font-semibold text-espresso-light">
            {result.feedback}
          </p>
          {result.tip && (
            <p className="mt-1 text-xs font-bold text-flame">
              Try: {result.tip}
            </p>
          )}
        </div>
      )}
      {error && <p className="text-xs font-bold text-red-700">{error}</p>}
    </div>
  );
}

/** Text Q&A for the current step — same assistant the voice button uses.
 *  When `snapFrame` returns a frame ("Show my food" is on), the question is
 *  answered through step-check so the model can see what the user means. */
export function StepAskBox({
  context,
  sessionId,
  stepIndex,
  snapFrame,
  onAction,
}: {
  context: StepContext;
  snapFrame?: () => string | null;
  onAction?: (action: NonNullable<AssistantReply["action"]>) => void;
} & SessionLink) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAsk() {
    const text = question.trim();
    if (!text) return;
    setLoading(true);
    setError(null);
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
                  question: text,
                  context,
                  sessionId,
                  stepIndex,
                  recipeId: context.recipeId,
                  recipeSlug: context.recipeSlug,
                }
              : {
                  question: text,
                  context: {
                    recipeTitle: context.recipeTitle,
                    stepTitle: context.stepTitle,
                  },
                  sessionId,
                  stepIndex,
                  channel: "text",
                },
          ),
        },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Assistant failed");
      if (!frame && body.action) onAction?.(body.action);
      setAnswer(frame ? body.feedback : body.answer);
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleAsk();
          }}
          placeholder="Ask about this step…"
          className="flex-1 rounded-xl border-2 border-espresso/10 bg-card p-2.5 text-sm font-semibold outline-none focus:border-flame"
        />
        <Button
          size="sm"
          disabled={loading || !question.trim()}
          onClick={handleAsk}
        >
          <Send className="h-4 w-4" />
          <Sparkles className="h-3 w-3" />
        </Button>
      </div>
      {answer && (
        <p className="rounded-2xl bg-oat p-3 text-sm font-semibold">{answer}</p>
      )}
      {error && <p className="text-xs font-bold text-red-700">{error}</p>}
    </div>
  );
}
