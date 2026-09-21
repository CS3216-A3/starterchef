import posthog from "posthog-js";

/**
 * Track a custom event in PostHog. Safe to call from client components;
 * it no-ops on the server or before PostHog is initialized.
 */
export function trackEvent(name: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  posthog.capture(name, properties);
}
