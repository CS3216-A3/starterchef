import { generateObject } from "ai";
import { getModelName, getProvider } from "@/lib/ai/model";

/**
 * Wraps generateObject with per-call telemetry: provider, model, latency, and
 * token usage are logged as a JSON line on every call. These logs feed the
 * production-optimization and model-comparison milestones — keep them on.
 * TODO: persist to a Supabase `ai_calls` table once auth is wired up.
 */

type GenerateObjectArgs = Parameters<typeof generateObject>[0];

export async function measuredGenerate(name: string, args: GenerateObjectArgs) {
  const startedAt = performance.now();
  const result = await generateObject(args);
  const latencyMs = Math.round(performance.now() - startedAt);

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

  return result;
}
