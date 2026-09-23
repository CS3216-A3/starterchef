import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

/**
 * Provider-agnostic model access.
 *
 * All LLM calls in the app go through getModel() — swap providers with the
 * AI_PROVIDER env var, and models with GOOGLE_MODEL / OPENAI_MODEL. This
 * abstraction is what lets us benchmark providers against each other for the
 * "right model for the job" milestone without touching call sites.
 */

export const AI_PROVIDERS = ["google", "openai", "google-lite"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const TEXT_CAPABILITIES = {
  "kitchen-scan": AI_PROVIDERS,
  "kitchen-voice": AI_PROVIDERS,
  suggestions: AI_PROVIDERS,
  assistant: AI_PROVIDERS,
  import: AI_PROVIDERS,
  edit: AI_PROVIDERS,
  adapt: AI_PROVIDERS,
  "step-check": AI_PROVIDERS,
} as const;
export type TextCapability = keyof typeof TEXT_CAPABILITIES;

export function getProvider(): AiProvider {
  const value = process.env.AI_PROVIDER ?? "google";
  if (value === "google" || value === "openai" || value === "google-lite")
    return value;
  throw new Error(
    `Unsupported AI_PROVIDER "${value}". Expected one of: ${AI_PROVIDERS.join(", ")}`,
  );
}

export function getModel(
  capabilityOrProvider: TextCapability | AiProvider = "assistant",
): LanguageModel {
  const explicitProvider = (AI_PROVIDERS as readonly string[]).includes(
    capabilityOrProvider,
  );
  const provider = explicitProvider
    ? (capabilityOrProvider as AiProvider)
    : getProvider();
  if (
    !explicitProvider &&
    !(
      TEXT_CAPABILITIES[
        capabilityOrProvider as TextCapability
      ] as readonly string[]
    ).includes(provider)
  ) {
    throw new Error("Configured provider is not approved for this capability");
  }
  switch (provider) {
    case "google":
      return google(process.env.GOOGLE_MODEL ?? "gemini-5.8-flash");
    case "google-lite":
      return google(process.env.GOOGLE_LITE_MODEL ?? "gemini-3.5-flash-lite");
    case "openai":
      return openai(process.env.OPENAI_MODEL ?? "gpt-5.6-luna");
  }
}

export function getModelName(provider: AiProvider = getProvider()): string {
  switch (provider) {
    case "google":
      return process.env.GOOGLE_MODEL ?? "gemini-5.8-flash";
    case "google-lite":
      return process.env.GOOGLE_LITE_MODEL ?? "gemini-3.5-flash-lite";
    case "openai":
      return process.env.OPENAI_MODEL ?? "gpt-5.6-luna";
  }
}
