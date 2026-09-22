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

export function getProvider(): AiProvider {
  const value = process.env.AI_PROVIDER ?? "google";
  if (value === "google" || value === "openai" || value === "google-lite")
    return value;
  throw new Error(
    `Unsupported AI_PROVIDER "${value}". Expected one of: ${AI_PROVIDERS.join(", ")}`,
  );
}

export function getModel(provider: AiProvider = getProvider()): LanguageModel {
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
