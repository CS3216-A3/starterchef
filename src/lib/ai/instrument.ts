import "server-only";
import { APICallError, generateObject } from "ai";
import { getModelName, getProvider, type AiProvider } from "@/lib/ai/model";
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

export const REDACTED_SDK_TELEMETRY = {
  isEnabled: true,
  recordInputs: false,
  recordOutputs: false,
} as const;

type CallMetadata = {
  userId?: string;
  route?: string;
  stage?: string;
  capability?: string;
  modality?: "text" | "image" | "audio" | "video" | "mixed";
  draftId?: string;
  sessionId?: string;
  voiceAttemptId?: string;
};

async function recordAiCall(row: Record<string, unknown>) {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    await createAdminClient().from("ai_calls").insert(row);
  } catch {
    // Telemetry must not prevent an AI answer or expose provider payloads.
  }
}

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
  modelContext?: { provider: AiProvider; model: string },
  metadata: CallMetadata = {},
) {
  const startedAt = performance.now();
  // OpenAI reasoning models reject sampling controls. The provider adapter
  // currently removes them with a warning; normalize once at the gateway so
  // all routes share quiet, provider-compatible behavior.
  const provider = modelContext?.provider ?? getProvider();
  const providerArgs =
    provider === "openai" ? { ...args, temperature: undefined } : args;

  const model = modelContext?.model ?? getModelName(provider);
  const safeName = name.replace(/[^a-z0-9-]/gi, "").slice(0, 80);
  const base = {
    user_id: metadata.userId ?? null,
    name: safeName,
    provider,
    model: model.slice(0, 80),
    route: (metadata.route ?? "gateway").slice(0, 100),
    stage: (metadata.stage ?? safeName).slice(0, 80),
    prompt_template_version: "phase5-v1",
    capability: (metadata.capability ?? safeName).slice(0, 40),
    modality: metadata.modality ?? "text",
    draft_id: metadata.draftId ?? null,
    session_id: metadata.sessionId ?? null,
    voice_attempt_id: metadata.voiceAttemptId ?? null,
  };
  try {
    const result = await generateObject({
      ...providerArgs,
      telemetry: { ...REDACTED_SDK_TELEMETRY, functionId: safeName },
    });
    await recordAiCall({
      ...base,
      outcome: "success",
      latency_ms: Math.round(performance.now() - startedAt),
      input_tokens: result.usage?.inputTokens ?? null,
      output_tokens: result.usage?.outputTokens ?? null,
    });
    return result;
  } catch (error) {
    await recordAiCall({
      ...base,
      outcome: "failure",
      latency_ms: Math.round(performance.now() - startedAt),
      error_code: safeAiFailureCode(error),
    });
    throw error;
  } finally {
    await flushPostHogAI();
  }
}
