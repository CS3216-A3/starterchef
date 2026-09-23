"use client";

import { ChefHat, Send, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/button";

/** Customisation is a request for an owned adaptation draft. The browser never
 * supplies a mutable recipe or saves an AI result directly. */
export function RecipeChat({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const [intent, setIntent] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = intent.trim();
    if (!value) return;
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/recipe-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "adapted",
          recipeId,
          intent: value,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || typeof body?.draftId !== "string") {
        setError(
          body?.error?.message ?? "Could not start the adaptation review",
        );
        return;
      }
      router.push(`/recipes/import?draft=${body.draftId}`);
    });
  }
  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-card p-5 ring-1 ring-oat">
      <h2 className="flex items-center gap-2 text-lg font-extrabold">
        <ChefHat className="h-5 w-5 text-flame" /> Customise with StarterChef{" "}
        <Sparkles className="h-4 w-4 text-flame" />
      </h2>
      <p className="text-sm font-semibold text-espresso-light">
        Describe the change you want. StarterChef will produce a reviewed draft
        for you to inspect and explicitly accept.
      </p>
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={intent}
          onChange={(event) => setIntent(event.target.value)}
          placeholder="e.g. make it vegetarian or serve one"
          className="flex-1 rounded-xl border-2 border-espresso/10 bg-oat p-2.5 text-sm font-semibold outline-none focus:border-flame"
        />
        <Button type="submit" size="md" disabled={pending || !intent.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
      {pending && (
        <p className="text-xs font-semibold text-espresso-light">
          Starting your reviewed adaptation…
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-oat p-3 text-sm font-bold text-flame"
        >
          {error}
        </p>
      )}
    </section>
  );
}
