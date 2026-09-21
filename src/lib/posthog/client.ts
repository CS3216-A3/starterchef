import posthog from "posthog-js";

/**
 * Initialize PostHog in the browser. Called once from the provider.
 * `capture_pageview: false` lets us manually capture route changes in the
 * Next.js App Router.
 */
export function initPostHog() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || typeof window === "undefined") return;

  posthog.init(key, {
    api_host:
      process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    person_profiles: "identified_only",
    capture_pageview: false,
    capture_pageleave: true,
  });
}
