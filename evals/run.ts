/**
 * Eval runner: executes the datasets in evals/datasets/ against the
 * configured provider (AI_PROVIDER) and scores simple, checkable criteria.
 *
 * Usage:
 *   npm run eval                      # default dataset, current provider
 *   npm run eval -- suggest-recipes   # one dataset, current provider
 *   npm run eval -- assistant         # assistant-quality dataset
 *   npm run eval -- --report          # compare all providers, write JSON
 *
 * Requires an API key in .env.local. Extend each case's `expect` block as the
 * checks get richer — these results feed the LLMOps milestone writeup.
 */

try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local not present — rely on real env vars
}

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { estimateCost } from "./costs";
import {
  AI_PROVIDERS,
  type AiProvider,
  getModel,
  getModelName,
} from "../src/lib/ai/model";

interface SuggestRecipesExpect {
  maxMissingIngredients?: number;
  maxPrepPlusCookMinutes?: number;
  maxDifficulty?: "easy" | "medium" | "hard";
  mustNotContain?: string[];
}

interface AssistantExpect {
  maxSentences?: number;
  mustContain?: string[];
  actionType?: string;
  tone?: string;
}

interface RecipeEvalCase {
  name: string;
  input: Record<string, unknown>;
  expect: SuggestRecipesExpect;
}

interface AssistantEvalCase {
  name: string;
  input: Record<string, unknown>;
  expect: AssistantExpect;
}

interface EvalResult {
  name: string;
  passed: boolean;
  problems: string[];
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  costInputUsd: number;
  costOutputUsd: number;
}

interface ProviderReport {
  provider: AiProvider;
  model: string;
  passed: number;
  failed: number;
  total: number;
  passRate: number;
  avgLatencyMs: number;
  totalCostUsd: number;
  cases: EvalResult[];
  error?: string;
}

const DIFFICULTY_RANK = { easy: 1, medium: 2, hard: 3 } as const;

function loadDataset<T>(name: string): T[] {
  const file = path.join(process.cwd(), "evals", "datasets", `${name}.jsonl`);
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

async function runDataset(
  datasetName: string,
  provider: AiProvider,
  temperature = 0.4,
): Promise<ProviderReport> {
  const cases = loadDataset<RecipeEvalCase>(datasetName);
  const { generateObject } = await import("ai");
  const { recipeSuggestionsSchema } =
    await import("../src/lib/ai/schemas/recipe");
  const { renderPrompt } = await import("../src/lib/ai/prompts");

  const modelName = getModelName(provider);

  console.log(
    `\n--- ${provider} / ${modelName} (${cases.length} case${cases.length === 1 ? "" : "s"}) ---\n`,
  );

  let passed = 0;
  let failed = 0;
  let totalLatency = 0;
  let totalCost = 0;
  const caseResults: EvalResult[] = [];

  for (const c of cases) {
    const input = c.input as {
      ingredients?: string[];
      equipment?: string[];
      dietaryRestrictions?: string[];
      allergies?: string[];
      tastePreferences?: string[];
      skillLevel?: string;
      timeMinutes?: number;
      servings?: number;
    };

    const startedAt = performance.now();
    const { object, usage } = await generateObject({
      model: getModel(provider),
      schema: recipeSuggestionsSchema,
      temperature: provider === "openai" ? undefined : temperature,
      system: renderPrompt("suggest-recipes", {
        ingredients: input.ingredients?.join(", ") || "none listed",
        equipment: input.equipment?.join(", ") || "none listed",
        dietaryRestrictions: input.dietaryRestrictions?.join(", ") || "none",
        allergies: input.allergies?.join(", ") || "none",
        tastePreferences: input.tastePreferences?.join(", ") || "none",
        skillLevel: input.skillLevel ?? "beginner",
        timeMinutes: input.timeMinutes?.toString() ?? "no limit",
        servings: input.servings?.toString() ?? "1",
      }),
      prompt: "Suggest meals I can cook tonight.",
    });
    const latencyMs = performance.now() - startedAt;

    const problems: string[] = [];
    for (const s of object.suggestions) {
      if (
        c.expect.maxMissingIngredients !== undefined &&
        s.missingIngredients.length > c.expect.maxMissingIngredients
      ) {
        problems.push(
          `"${s.title}" needs ${s.missingIngredients.length} missing ingredients (max ${c.expect.maxMissingIngredients})`,
        );
      }
      if (
        c.expect.maxPrepPlusCookMinutes !== undefined &&
        s.prepMinutes + s.cookMinutes > c.expect.maxPrepPlusCookMinutes
      ) {
        problems.push(
          `"${s.title}" takes ${s.prepMinutes + s.cookMinutes} min (max ${c.expect.maxPrepPlusCookMinutes})`,
        );
      }
      if (
        c.expect.maxDifficulty &&
        DIFFICULTY_RANK[s.difficulty] > DIFFICULTY_RANK[c.expect.maxDifficulty]
      ) {
        problems.push(
          `"${s.title}" is ${s.difficulty} (max ${c.expect.maxDifficulty})`,
        );
      }
      const haystack = JSON.stringify(s).toLowerCase();
      for (const banned of c.expect.mustNotContain ?? []) {
        if (haystack.includes(banned.toLowerCase())) {
          problems.push(`"${s.title}" mentions banned item "${banned}"`);
        }
      }
    }

    const isPass = problems.length === 0;
    if (isPass) passed++;
    else failed++;

    const inputTokens = usage?.inputTokens ?? 0;
    const outputTokens = usage?.outputTokens ?? 0;
    const totalTokens = usage?.totalTokens ?? inputTokens + outputTokens;
    const cost = estimateCost(modelName, inputTokens, outputTokens);
    totalLatency += latencyMs;
    totalCost += cost.usd;

    caseResults.push({
      name: c.name,
      passed: isPass,
      problems,
      latencyMs,
      inputTokens,
      outputTokens,
      totalTokens,
      costUsd: cost.usd,
      costInputUsd: cost.inputUsd,
      costOutputUsd: cost.outputUsd,
    });

    const status = isPass ? "PASS" : "FAIL";
    console.log(
      `${status}  ${c.name}  (${object.suggestions.length} suggestions, ${totalTokens} tokens, ${latencyMs.toFixed(0)}ms, $${cost.usd.toFixed(5)})`,
    );
    for (const p of problems) console.log(`      - ${p}`);
  }

  console.log(
    `\n${passed}/${cases.length} passed · avg latency ${(totalLatency / cases.length).toFixed(0)}ms · total cost $${totalCost.toFixed(5)}`,
  );

  return {
    provider,
    model: modelName,
    passed,
    failed,
    total: cases.length,
    passRate: cases.length ? passed / cases.length : 0,
    avgLatencyMs: cases.length ? totalLatency / cases.length : 0,
    totalCostUsd: totalCost,
    cases: caseResults,
  };
}

async function runAssistantDataset(
  provider: AiProvider,
  temperature = 0.7,
): Promise<ProviderReport> {
  const cases = loadDataset<AssistantEvalCase>("assistant");
  const { generateObject } = await import("ai");
  const { assistantReplySchema } =
    await import("../src/lib/ai/schemas/assistant");
  const { renderPrompt } = await import("../src/lib/ai/prompts");

  const modelName = getModelName(provider);

  console.log(
    `\n--- assistant / ${provider} / ${modelName} (${cases.length} case${cases.length === 1 ? "" : "s"}) ---\n`,
  );

  let passed = 0;
  let failed = 0;
  let totalLatency = 0;
  let totalCost = 0;
  const caseResults: EvalResult[] = [];

  for (const c of cases) {
    const input = c.input as {
      question: string;
      recipeTitle: string;
      stepTitle: string;
    };

    const startedAt = performance.now();
    const { object, usage } = await generateObject({
      model: getModel(provider),
      schema: assistantReplySchema,
      temperature: provider === "openai" ? undefined : temperature,
      system: renderPrompt("cooking-assistant", {
        recipeTitle: input.recipeTitle,
        stepTitle: input.stepTitle,
        stepInstruction: "Follow the current recipe step safely.",
        recipeIngredients: "Use the recipe ingredients safely.",
        recipeEquipment: "Use normal kitchen equipment.",
        pantry: "Not provided for this evaluation.",
        adjustments: "none",
        memory: "- Nothing recorded yet.",
        dietaryRestrictions: "none",
        allergies: "none",
      }),
      prompt: input.question,
    });
    const latencyMs = performance.now() - startedAt;

    const problems: string[] = [];
    const haystack = object.answer.toLowerCase();

    if (c.expect.maxSentences !== undefined) {
      const sentences = object.answer
        .split(/[.!?]+/)
        .filter((s) => s.trim().length > 0);
      if (sentences.length > c.expect.maxSentences) {
        problems.push(
          `answer has ${sentences.length} sentences (max ${c.expect.maxSentences})`,
        );
      }
    }

    for (const required of c.expect.mustContain ?? []) {
      if (!haystack.includes(required.toLowerCase())) {
        problems.push(`answer does not mention "${required}"`);
      }
    }

    if (
      c.expect.actionType !== undefined &&
      object.action?.type !== c.expect.actionType
    ) {
      problems.push(
        `expected action "${c.expect.actionType}" but got "${object.action?.type ?? "none"}"`,
      );
    }

    const isPass = problems.length === 0;
    if (isPass) passed++;
    else failed++;

    const inputTokens = usage?.inputTokens ?? 0;
    const outputTokens = usage?.outputTokens ?? 0;
    const totalTokens = usage?.totalTokens ?? inputTokens + outputTokens;
    const cost = estimateCost(modelName, inputTokens, outputTokens);
    totalLatency += latencyMs;
    totalCost += cost.usd;

    caseResults.push({
      name: c.name,
      passed: isPass,
      problems,
      latencyMs,
      inputTokens,
      outputTokens,
      totalTokens,
      costUsd: cost.usd,
      costInputUsd: cost.inputUsd,
      costOutputUsd: cost.outputUsd,
    });

    const status = isPass ? "PASS" : "FAIL";
    console.log(
      `${status}  ${c.name}  (${totalTokens} tokens, ${latencyMs.toFixed(0)}ms, $${cost.usd.toFixed(5)})`,
    );
    for (const p of problems) console.log(`      - ${p}`);
  }

  console.log(
    `\n${passed}/${cases.length} passed · avg latency ${(totalLatency / cases.length).toFixed(0)}ms · total cost $${totalCost.toFixed(5)}`,
  );

  return {
    provider,
    model: modelName,
    passed,
    failed,
    total: cases.length,
    passRate: cases.length ? passed / cases.length : 0,
    avgLatencyMs: cases.length ? totalLatency / cases.length : 0,
    totalCostUsd: totalCost,
    cases: caseResults,
  };
}

async function runSingle(datasetName: string) {
  const provider = (process.env.AI_PROVIDER as AiProvider) ?? "google";
  const temperature = Number(process.env.EVAL_TEMPERATURE ?? 0.4);

  const report =
    datasetName === "assistant"
      ? await runAssistantDataset(provider, 0.7)
      : await runDataset(datasetName, provider, temperature);

  process.exit(report.failed ? 1 : 0);
}

async function runReport() {
  const datasetName = "suggest-recipes";
  const temperature = Number(process.env.EVAL_TEMPERATURE ?? 0.4);
  const resultsDir = path.join(process.cwd(), "evals", "results");
  mkdirSync(resultsDir, { recursive: true });

  const reports: ProviderReport[] = [];
  for (const provider of AI_PROVIDERS) {
    try {
      reports.push(await runDataset(datasetName, provider, temperature));
    } catch {
      const message = "PROVIDER_EVALUATION_FAILED";
      console.error(`\nProvider ${provider} failed: ${message}`);
      reports.push({
        provider,
        model: getModelName(provider),
        passed: 0,
        failed: 0,
        total: 0,
        passRate: 0,
        avgLatencyMs: 0,
        totalCostUsd: 0,
        cases: [],
        error: message,
      });
    }
  }

  const output = {
    dataset: datasetName,
    temperature,
    ranAt: new Date().toISOString(),
    providers: reports,
  };

  const outFile = path.join(resultsDir, "text-model-comparison.json");
  writeFileSync(outFile, JSON.stringify(output, null, 2));
  console.log(`\nComparison report written to ${outFile}`);
}

async function main() {
  const args = process.argv.slice(2);
  const reportMode = args.includes("--report");
  const datasetArg = args.find((a) => !a.startsWith("-"));

  if (reportMode) {
    await runReport();
    return;
  }

  await runSingle(datasetArg ?? "suggest-recipes");
}

main().catch(() => {
  console.error("Evaluation failed: provider unavailable or output invalid");
  process.exit(1);
});
