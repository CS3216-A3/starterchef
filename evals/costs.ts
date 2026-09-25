/**
 * Approximate per-million-token pricing for the models used in the comparison.
 * These numbers are directional only; actual billed rates depend on the region,
 * context caching, and any preview discounts. Update them before the final
 * writeup if you want exact figures.
 */

interface ModelRate {
  inputPerM: number; // USD per 1M input tokens
  outputPerM: number; // USD per 1M output tokens
}

const RATES: Record<string, ModelRate> = {
  // Google Gemini text/vision models
  "gemini-3.8-flash": { inputPerM: 0.15, outputPerM: 0.6 },
  "gemini-3.5-flash-lite": { inputPerM: 0.3, outputPerM: 2.5 },
  "gemini-3.6-flash": { inputPerM: 0.15, outputPerM: 0.6 },

  // OpenAI text/vision models
  "gpt-5.6-luna": { inputPerM: 0.3, outputPerM: 1.2 },
  "gpt-5-mini": { inputPerM: 0.15, outputPerM: 0.6 },
  "gpt-4o-mini": { inputPerM: 0.15, outputPerM: 0.6 },
};

export function getModelRate(modelName: string): ModelRate | undefined {
  return RATES[modelName];
}

export function estimateCost(
  modelName: string,
  inputTokens: number,
  outputTokens: number,
): { usd: number; inputUsd: number; outputUsd: number } {
  const rate = getModelRate(modelName);
  if (!rate) {
    return { usd: 0, inputUsd: 0, outputUsd: 0 };
  }
  const inputUsd = (inputTokens / 1_000_000) * rate.inputPerM;
  const outputUsd = (outputTokens / 1_000_000) * rate.outputPerM;
  return {
    inputUsd,
    outputUsd,
    usd: inputUsd + outputUsd,
  };
}
