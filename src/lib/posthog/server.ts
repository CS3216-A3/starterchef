import { PostHog } from "posthog-node";
import { posthogSpanProcessor } from "@/instrumentation";

/**
 * Server-side PostHog client for capturing custom events from API routes.
 */
let client: PostHog | null = null;

export function getPostHogServerClient(): PostHog | null {
  if (client) return client;

  const key = process.env.POSTHOG_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.POSTHOG_HOST ?? process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!key) return null;

  client = new PostHog(key, {
    host: host ?? "https://us.i.posthog.com",
    flushAt: 1,
    flushInterval: 0,
  });

  return client;
}

/**
 * Flush any queued OpenTelemetry spans to PostHog. Call before a request/edge
 * function ends to avoid losing telemetry in serverless environments.
 */
export async function flushPostHogAI() {
  if (posthogSpanProcessor) {
    await posthogSpanProcessor.forceFlush();
  }
}
