import { generateObject } from "ai";
import { getModelName, getProvider } from "@/lib/ai/model";
import { flushPostHogAI } from "@/lib/posthog/server";

/**
 * Wraps generateObject with per-call telemetry: provider, model, latency, and
 * token usage are logged to console. The PostHog OpenTelemetry integration
 * (configured in src/instrumentation.ts) captures these calls as
 * `$ai_generation` events automatically.
 *
 * Note: Vercel AI SDK's `runtimeContext` is not yet supported for object
 * generation, so user/session attribution for these calls will be handled by
 * PostHog's default span attribution until the SDK adds support.
 */

type GenerateObjectArgs = Parameters<typeof generateObject>[0];

export async function measuredGenerate(name: string, args: GenerateObjectArgs) {
  const startedAt = performance.now();

  const result = await generateObject({
    ...args,
    telemetry: {
      functionId: name,
    },
  });

  const latencyMs = performance.now() - startedAt;

  console.info(
    JSON.stringify({
      event: "ai_call",
      name,
      provider: getProvider(),
      model: getModelName(),
      latencyMs,
      usage: result.usage,
    }),
  );

  await flushPostHogAI();

  return result;
}
