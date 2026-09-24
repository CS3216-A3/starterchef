"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getApiErrorMessage } from "@/lib/client-api-error";
import { trackEvent } from "@/lib/posthog/events";

type Recommendation = {
  id: string;
  slug: string;
  title: string;
  description: string;
  minutes: number;
  servings: number;
  difficulty: string;
  reason: string;
};

export function RecommendationPanel({
  maxMinutes,
  servings,
}: {
  maxMinutes?: number;
  servings?: number;
}) {
  const [state, setState] = useState<{
    loading: boolean;
    items: Recommendation[];
    message?: string;
  }>({ loading: true, items: [] });
  useEffect(() => {
    let active = true;
    void (async () => {
      const response = await fetch("/api/ai/suggest-recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(maxMinutes ? { maxMinutes } : {}),
          ...(servings ? { servings } : {}),
        }),
      });
      if (!active) return;
      if (!response.ok)
        return setState({
          loading: false,
          items: [],
          message: await getApiErrorMessage(
            response,
            "Recommendations are unavailable right now.",
          ),
        });
      const body = (await response.json()) as {
        recommendations?: Recommendation[];
      };

      const recommendations = body.recommendations ?? [];

      trackEvent("recommendations_generated", {
        result_count: recommendations.length,
        max_minutes: maxMinutes,
        servings,
      });

      setState({
        loading: false,
        items: recommendations,
      });
    })().catch(
      () =>
        active &&
        setState({
          loading: false,
          items: [],
          message: "Recommendations are unavailable right now.",
        }),
    );
    return () => {
      active = false;
    };
  }, [maxMinutes, servings]);

  return (
    <section className="rounded-3xl bg-oat p-5" aria-live="polite">
      <h2 className="text-xl font-extrabold">Recommended for your kitchen</h2>
      {state.loading ? (
        <p className="mt-2 text-sm font-semibold text-espresso-light">
          Finding safe matches…
        </p>
      ) : null}
      {state.message ? (
        <p role="alert" className="mt-2 text-sm font-semibold text-flame-dark">
          {state.message}
        </p>
      ) : null}
      {!state.loading && !state.message && state.items.length === 0 ? (
        <p className="mt-2 text-sm font-semibold text-espresso-light">
          No recipes safely match your kitchen and profile yet.
        </p>
      ) : null}
      {state.items.length > 0 ? (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {state.items.map((item) => (
            <li key={item.id} className="rounded-2xl bg-card p-4">
              <Link
                href={`/recipes/${item.slug}`}
                onClick={() =>
                  trackEvent("recipe_selected", {
                    recipe_id: item.id,
                    source: "recommendation",
                  })
                }
                className="font-extrabold hover:text-flame"
              >
                {item.title}
              </Link>
              <p className="mt-1 text-xs font-semibold text-espresso-light">
                {item.minutes} min · {item.servings} servings ·{" "}
                {item.difficulty}
              </p>
              <p className="mt-2 text-sm font-semibold text-espresso-light">
                {item.reason}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
