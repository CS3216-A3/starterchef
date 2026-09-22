"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChefHat, Send } from "lucide-react";
import { Button } from "@/components/button";
import {
  createUserRecipe,
  updateUserRecipe,
} from "@/app/(app)/recipes/actions";
import type { AdaptedRecipe } from "@/lib/ai/schemas/recipe";
import type { RecipeRow } from "@/lib/types";

type ChatMessage =
  | { role: "user"; text: string }
  | {
      role: "assistant";
      adapted: AdaptedRecipe;
      status: "pending" | "applied" | "dismissed";
    };

/**
 * Chat with StarterChef to customise a recipe. Every AI reply is a
 * suggestion — the user applies it (as a personalised copy, or an update to
 * their own recipe) or dismisses it. Never auto-applied.
 */
export function RecipeChat({
  recipe,
  isOwner,
}: {
  recipe: RecipeRow;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function recipePayload() {
    return {
      title: recipe.title,
      description: recipe.description,
      minutes: recipe.minutes,
      difficulty: recipe.difficulty,
      servings: recipe.servings,
      ingredients: recipe.ingredients,
      equipment: recipe.equipment,
      steps: recipe.steps.map((s) => ({
        index: s.index,
        title: s.title,
        instruction: s.instruction,
        durationSeconds: s.durationSeconds,
        ingredients: s.ingredients,
        tip: s.tip,
        photoCheckpoint: s.photoCheckpoint,
      })),
    };
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", text }]);

    startTransition(async () => {
      try {
        const res = await fetch("/api/ai/adapt-recipe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request: text,
            recipe: recipePayload(),
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Adaptation failed");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            adapted: body as AdaptedRecipe,
            status: "pending",
          },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function applySuggestion(index: number, mode: "copy" | "update") {
    const msg = messages[index];
    if (msg?.role !== "assistant") return;
    const adapted = msg.adapted;

    startTransition(async () => {
      const result =
        mode === "update"
          ? await updateUserRecipe({
              id: recipe.id,
              title: adapted.title,
              description: adapted.description,
              minutes: adapted.minutes,
              difficulty: adapted.difficulty,
              servings: adapted.servings,
              ingredients: adapted.ingredients,
              equipment: adapted.equipment,
              steps: adapted.steps,
              tags: adapted.tags,
            })
          : await createUserRecipe({
              ...adapted,
              whyGood: adapted.whyGood ?? recipe.why_good,
              source: "personalized",
              parentRecipeId: recipe.id,
            });

      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }

      setMessages((prev) =>
        prev.map((m, i) =>
          i === index && m.role === "assistant"
            ? { ...m, status: "applied" }
            : m,
        ),
      );

      if (mode === "copy" && "slug" in result) {
        router.push(`/recipes/${result.slug}`);
      } else {
        router.refresh();
      }
    });
  }

  function dismissSuggestion(index: number) {
    setMessages((prev) =>
      prev.map((m, i) =>
        i === index && m.role === "assistant"
          ? { ...m, status: "dismissed" }
          : m,
      ),
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-card p-5 ring-1 ring-oat">
      <h2 className="flex items-center gap-2 text-lg font-extrabold">
        <ChefHat className="h-5 w-5 text-flame" />
        Customise with StarterChef
      </h2>
      <p className="text-sm font-semibold text-espresso-light">
        Ask for changes — “make it serve 1”, “no oven”, “less spicy” — and
        review the suggestion before anything is saved.
      </p>

      {messages.length > 0 && (
        <div className="flex flex-col gap-3">
          {messages.map((msg, i) =>
            msg.role === "user" ? (
              <p
                key={i}
                className="self-end rounded-2xl bg-flame px-4 py-2 text-sm font-bold text-white"
              >
                {msg.text}
              </p>
            ) : msg.status === "dismissed" ? null : (
              <div
                key={i}
                className="flex flex-col gap-2 self-start rounded-2xl bg-oat p-4"
              >
                <p className="text-sm font-semibold">
                  {msg.adapted.changeSummary}
                </p>
                <p className="text-xs font-semibold text-espresso-light">
                  {msg.adapted.title} · serves {msg.adapted.servings} ·{" "}
                  {msg.adapted.minutes} min · {msg.adapted.steps.length} steps
                </p>
                {msg.status === "pending" ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => applySuggestion(i, "copy")}
                    >
                      Save as my version
                    </Button>
                    {isOwner && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => applySuggestion(i, "update")}
                      >
                        Update this recipe
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => dismissSuggestion(i)}
                    >
                      Dismiss
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs font-bold text-flame">Applied ✓</p>
                )}
              </div>
            ),
          )}
        </div>
      )}

      <form onSubmit={handleSend} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. make it vegetarian, halve the servings…"
          className="flex-1 rounded-xl border-2 border-espresso/10 bg-oat p-2.5 text-sm font-semibold outline-none focus:border-flame"
        />
        <Button type="submit" size="md" disabled={pending || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
      {pending && (
        <p className="text-xs font-semibold text-espresso-light">
          StarterChef is thinking…
        </p>
      )}
      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
