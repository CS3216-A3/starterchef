import "server-only";
import { APICallError, generateObject } from "ai";
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

export type MeasuredGenerateArgs = Parameters<typeof generateObject>[0];

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function safeProviderRejectionCode(error: APICallError): string {
  const data = record(error.data);
  const detail = data && record(data.error) ? record(data.error) : data;
  const code = detail?.code;
  const parameter = detail?.param;

  if (code === "invalid_json_schema" || code === "schema_validation_error")
    return "PROVIDER_SCHEMA_REJECTED";
  if (code === "invalid_image" || code === "image_too_large")
    return "PROVIDER_IMAGE_REJECTED";
  if (
    code === "unsupported_parameter" ||
    (typeof parameter === "string" &&
      !parameter.startsWith("input") &&
      !parameter.startsWith("text.format"))
  )
    return "PROVIDER_PARAMETER_REJECTED";
  if (typeof parameter === "string" && parameter.startsWith("text.format"))
    return "PROVIDER_SCHEMA_REJECTED";
  if (typeof parameter === "string" && parameter.startsWith("input"))
    return "PROVIDER_IMAGE_REJECTED";
  return "PROVIDER_REJECTED";
}

/**
 * Maps SDK failures to a small, safe diagnostic vocabulary. Provider response
 * bodies can contain prompts or implementation details and must never reach
 * logs or API responses.
 */
export function safeAiFailureCode(error: unknown): string {
  if (!APICallError.isInstance(error)) return "GENERATION_FAILED";

  switch (error.statusCode) {
    case 400:
      return safeProviderRejectionCode(error);
    case 401:
    case 403:
      return "PROVIDER_AUTH_FAILED";
    case 429:
      return "PROVIDER_RATE_LIMITED";
    default:
      return error.statusCode != null && error.statusCode >= 500
        ? "PROVIDER_UNAVAILABLE"
        : "PROVIDER_REQUEST_FAILED";
  }
}

export async function measuredGenerate(
  name: string,
  args: MeasuredGenerateArgs,
) {
  const startedAt = performance.now();
  // OpenAI reasoning models reject sampling controls. The provider adapter
  // currently removes them with a warning; normalize once at the gateway so
  // all routes share quiet, provider-compatible behavior.
  const providerArgs =
    getProvider() === "openai" ? { ...args, temperature: undefined } : args;

  const result = await generateObject({
    ...providerArgs,
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
