"use client";

import { useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { Button } from "@/components/button";
import type { AssistantReply } from "@/lib/ai/schemas/assistant";

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
          placeholder="Type a question here about this step…"
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
