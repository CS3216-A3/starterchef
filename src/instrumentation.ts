import { OpenTelemetry } from "@ai-sdk/otel";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { PostHogSpanProcessor } from "@posthog/ai/otel";
import { registerTelemetry } from "ai";

/**
 * Initialize PostHog AI observability via OpenTelemetry.
 *
 * Loaded automatically by Next.js at runtime. The processor batches spans and
 * sends them to PostHog as $ai_generation events.
 */

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

export const posthogSpanProcessor = projectToken
  ? new PostHogSpanProcessor({ projectToken, host })
  : null;

if (posthogSpanProcessor) {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      "service.name": "starterchef",
    }),
    spanProcessors: [posthogSpanProcessor],
  });
  sdk.start();
}

registerTelemetry(
  new OpenTelemetry({
    enrichSpan: ({ runtimeContext }) => ({
      environment:
        typeof runtimeContext?.properties === "object" &&
        runtimeContext.properties !== null &&
        "environment" in runtimeContext.properties &&
        typeof runtimeContext.properties.environment === "string"
          ? runtimeContext.properties.environment
          : undefined,
      "posthog.distinct_id":
        typeof runtimeContext?.distinctId === "string"
          ? runtimeContext.distinctId
          : undefined,
      $ai_session_id:
        typeof runtimeContext?.sessionId === "string"
          ? runtimeContext.sessionId
          : undefined,
      $ai_trace_name:
        typeof runtimeContext?.traceName === "string"
          ? runtimeContext.traceName
          : undefined,
      $groups:
        typeof runtimeContext?.groups === "object" &&
        runtimeContext.groups !== null &&
        !Array.isArray(runtimeContext.groups)
          ? JSON.stringify(runtimeContext.groups)
          : undefined,
    }),
  }),
);
