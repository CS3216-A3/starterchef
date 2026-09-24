/**
 * StarterChef AI evaluation runner.
 *
 * It evaluates the two production text-AI paths that are easiest to score
 * repeatably:
 *   1. catalogue recommendation filtering + AI ranking
 *   2. the in-cooking assistant's answer and structured action
 *
 * Usage:
 *   npm run eval -- recommendations
 *   npm run eval -- assistant
 *   npm run eval -- all
 *   EVAL_RUNS=3 npm run eval -- all
 *   npm run eval -- recommendations --offline
 *   npm run eval -- --report
 */

try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local is optional for deterministic/offline checks.
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
import { renderPrompt } from "../src/lib/ai/prompts";
import { assistantReplySchema } from "../src/lib/ai/schemas/assistant";
import { recommendationRankingSchema } from "../src/lib/ai/schemas/recommendations";
import {
  rankEligibleRecipes,
  validateAiRanking,
} from "../src/lib/recommendations";
import type {
  KitchenItemRow,
  ProfileRow,
  RecipeDifficulty,
  RecipeRow,
} from "../src/lib/types";

interface RecommendationRecipeInput {
  id: string;
  title: string;
  minutes: number;
  difficulty: RecipeDifficulty;
  servings: number;
  ingredients: string[];
  equipment: string[];
  tags?: string[];
}

interface RecommendationCase {
  name: string;
  safetyCritical?: boolean;
  input: {
    recipes: RecommendationRecipeInput[];
    pantry: { ingredients: string[]; equipment: string[] };
    profile: {
      skillLevel: "beginner" | "intermediate" | "advanced";
      dietaryRestrictions?: string[];
      allergies?: string[];
    };
    filters?: { maxMinutes?: number; servings?: number };
  };
  expect: {
    eligibleIds: string[];
    preferredFirstIds?: string[];
    reasonMustContainAny?: Record<string, string[]>;
  };
}

interface AssistantCase {
  name: string;
  safetyCritical?: boolean;
  input: {
    question: string;
    recipeTitle: string;
    stepTitle: string;
    memory?: string[];
    dietaryRestrictions?: string[];
    allergies?: string[];
    pantry?: string[];
    adjustments?: unknown[];
  };
  expect: {
    maxSentences?: number;
    mustContain?: string[];
    mustContainAny?: string[][];
    mustNotContain?: string[];
    actionType?: string;
    timerSeconds?: number;
    stepIndex?: number;
  };
}

interface EvalResult {
  dataset: "recommendations" | "assistant";
  name: string;
  run: number;
  passed: boolean;
  safetyCritical: boolean;
  problems: string[];
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  output: unknown;
}

interface SuiteReport {
  dataset: "recommendations" | "assistant";
  provider: AiProvider;
  model: string;
  mode: "live" | "offline";
  runsPerCase: number;
  passed: number;
  failed: number;
  total: number;
  passRate: number;
  safetyPassed: number;
  safetyTotal: number;
  safetyPassRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  totalCostUsd: number;
  cases: EvalResult[];
}

const RESULTS_DIR = path.join(process.cwd(), "evals", "results");

function loadDataset<T>(name: string): T[] {
  const file = path.join(process.cwd(), "evals", "datasets", `${name}.jsonl`);
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[
    Math.min(ordered.length - 1, Math.ceil(fraction * ordered.length) - 1)
  ];
}

function createReport(
  dataset: SuiteReport["dataset"],
  provider: AiProvider,
  mode: SuiteReport["mode"],
  runsPerCase: number,
  cases: EvalResult[],
): SuiteReport {
  const passed = cases.filter((result) => result.passed).length;
  const safetyCases = cases.filter((result) => result.safetyCritical);
  const safetyPassed = safetyCases.filter((result) => result.passed).length;
  const latencies = cases.map((result) => result.latencyMs);
  return {
    dataset,
    provider,
    model: getModelName(provider),
    mode,
    runsPerCase,
    passed,
    failed: cases.length - passed,
    total: cases.length,
    passRate: cases.length ? passed / cases.length : 0,
    safetyPassed,
    safetyTotal: safetyCases.length,
    safetyPassRate: safetyCases.length ? safetyPassed / safetyCases.length : 1,
    avgLatencyMs:
      latencies.reduce((total, latency) => total + latency, 0) /
      Math.max(latencies.length, 1),
    p95LatencyMs: percentile(latencies, 0.95),
    totalCostUsd: cases.reduce((total, result) => total + result.costUsd, 0),
    cases,
  };
}

function writeReport(report: SuiteReport): string {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const file = path.join(
    RESULTS_DIR,
    `${report.dataset}-${report.provider}-${report.mode}.json`,
  );
  writeFileSync(
    file,
    JSON.stringify({ ranAt: new Date().toISOString(), ...report }, null, 2),
  );
  return file;
}

function recipeRow(input: RecommendationRecipeInput): RecipeRow {
  return {
    id: input.id,
    slug: input.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""),
    title: input.title,
    description: `${input.title} evaluation fixture`,
    minutes: input.minutes,
    difficulty: input.difficulty,
    servings: input.servings,
    why_good: "Evaluation fixture",
    icon: "chef-hat",
    image_tint: "oat",
    image_url: null,
    ingredients: input.ingredients,
    equipment: input.equipment,
    steps: [
      {
        index: 1,
        title: "Cook",
        instruction: "Cook until ready.",
        ingredients: input.ingredients,
      },
    ],
    tags: input.tags ?? [],
    source: "evaluation",
    source_url: null,
    user_id: null,
    parent_recipe_id: null,
    is_personalized: false,
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

function pantryRows(input: RecommendationCase["input"]): KitchenItemRow[] {
  return [
    ...input.pantry.ingredients.map((name, index) => ({
      id: `ingredient-${index}`,
      user_id: "eval-user",
      kind: "ingredient" as const,
      name,
      quantity: null,
      expires_on: null,
      icon: null,
      source: "manual" as const,
      created_at: "2026-01-01T00:00:00.000Z",
    })),
    ...input.pantry.equipment.map((name, index) => ({
      id: `equipment-${index}`,
      user_id: "eval-user",
      kind: "equipment" as const,
      name,
      quantity: null,
      expires_on: null,
      icon: null,
      source: "manual" as const,
      created_at: "2026-01-01T00:00:00.000Z",
    })),
  ];
}

function profileRow(input: RecommendationCase["input"]): ProfileRow {
  return {
    id: "eval-user",
    display_name: null,
    dietary_restrictions: input.profile.dietaryRestrictions ?? [],
    allergies: input.profile.allergies ?? [],
    taste_preferences: {},
    skill_level: input.profile.skillLevel,
    household_size: input.filters?.servings ?? 1,
    onboarded_at: "2026-01-01T00:00:00.000Z",
  };
}

function sameSet(actual: string[], expected: string[]): boolean {
  return (
    actual.length === expected.length &&
    actual.every((value) => expected.includes(value))
  );
}

async function runRecommendations(
  provider: AiProvider,
  runsPerCase: number,
  offline: boolean,
): Promise<SuiteReport> {
  const dataset = loadDataset<RecommendationCase>("recommendations");
  const { generateObject } = await import("ai");
  const modelName = getModelName(provider);
  const results: EvalResult[] = [];

  console.log(
    `\n--- recommendations / ${provider} / ${modelName} (${offline ? "offline safety gates" : `${runsPerCase} run(s) per case`}) ---\n`,
  );

  for (const testCase of dataset) {
    const eligible = rankEligibleRecipes(
      testCase.input.recipes.map(recipeRow),
      pantryRows(testCase.input),
      profileRow(testCase.input),
      [],
      testCase.input.filters ?? {},
    );
    const eligibleIds = eligible.map(({ recipe }) => recipe.id);

    for (let run = 1; run <= (offline ? 1 : runsPerCase); run++) {
      const problems: string[] = [];
      if (!sameSet(eligibleIds, testCase.expect.eligibleIds)) {
        problems.push(
          `eligible IDs were [${eligibleIds.join(", ")}], expected [${testCase.expect.eligibleIds.join(", ")}]`,
        );
      }

      let latencyMs = 0;
      let inputTokens = 0;
      let outputTokens = 0;
      let rankings: Array<{ id: string; reason: string }> = eligible.map(
        ({ recipe, pantryMatches }) => ({
          id: recipe.id,
          reason: `Deterministic candidate with ${pantryMatches.length} pantry matches`,
        }),
      );

      if (!offline && eligible.length > 0) {
        const startedAt = performance.now();
        const generated = await generateObject({
          model: getModel(provider),
          schema: recommendationRankingSchema,
          temperature: provider === "openai" ? undefined : 0.4,
          system: renderPrompt("recommendations", {
            candidates: JSON.stringify(
              eligible.map(({ recipe, pantryMatches }) => ({
                id: recipe.id,
                title: recipe.title,
                minutes: recipe.minutes,
                ingredients: recipe.ingredients,
                pantryMatches,
              })),
            ),
          }),
          prompt: "Rank the eligible recipes.",
        });
        latencyMs = performance.now() - startedAt;
        rankings = generated.object.rankings;
        inputTokens = generated.usage?.inputTokens ?? 0;
        outputTokens = generated.usage?.outputTokens ?? 0;

        if (rankings.length === 0) problems.push("model returned no rankings");
        const seen = new Set<string>();
        for (const ranking of rankings) {
          if (!eligibleIds.includes(ranking.id)) {
            problems.push(
              `model invented or leaked candidate ID ${ranking.id}`,
            );
          }
          if (seen.has(ranking.id)) {
            problems.push(
              `model returned duplicate candidate ID ${ranking.id}`,
            );
          }
          seen.add(ranking.id);
          const required = testCase.expect.reasonMustContainAny?.[ranking.id];
          if (
            required?.length &&
            !required.some((term) =>
              ranking.reason.toLowerCase().includes(term.toLowerCase()),
            )
          ) {
            problems.push(
              `reason for ${ranking.id} was not grounded in one of: ${required.join(", ")}`,
            );
          }
        }

        const validated = validateAiRanking(rankings, eligible);
        const firstId = validated[0]?.recipe.id;
        if (
          firstId &&
          testCase.expect.preferredFirstIds?.length &&
          !testCase.expect.preferredFirstIds.includes(firstId)
        ) {
          problems.push(
            `first ranked ID ${firstId} was not an expected best match`,
          );
        }
      }

      const totalTokens = inputTokens + outputTokens;
      const cost = estimateCost(modelName, inputTokens, outputTokens);
      const result: EvalResult = {
        dataset: "recommendations",
        name: testCase.name,
        run,
        passed: problems.length === 0,
        safetyCritical: testCase.safetyCritical ?? false,
        problems,
        latencyMs,
        inputTokens,
        outputTokens,
        totalTokens,
        costUsd: cost.usd,
        output: { eligibleIds, rankings },
      };
      results.push(result);
      console.log(
        `${result.passed ? "PASS" : "FAIL"}  ${testCase.name}${offline ? "" : ` [run ${run}]`}  (${totalTokens} tokens, ${latencyMs.toFixed(0)}ms, $${cost.usd.toFixed(5)})`,
      );
      for (const problem of problems) console.log(`      - ${problem}`);
    }
  }

  return createReport(
    "recommendations",
    provider,
    offline ? "offline" : "live",
    offline ? 1 : runsPerCase,
    results,
  );
}

async function runAssistant(
  provider: AiProvider,
  runsPerCase: number,
): Promise<SuiteReport> {
  const dataset = loadDataset<AssistantCase>("assistant");
  const { generateObject } = await import("ai");
  const modelName = getModelName(provider);
  const results: EvalResult[] = [];

  console.log(
    `\n--- assistant / ${provider} / ${modelName} (${runsPerCase} run(s) per case) ---\n`,
  );

  for (const testCase of dataset) {
    for (let run = 1; run <= runsPerCase; run++) {
      const startedAt = performance.now();
      const generated = await generateObject({
        model: getModel(provider),
        schema: assistantReplySchema,
        temperature: provider === "openai" ? undefined : 0.7,
        system: renderPrompt("cooking-assistant", {
          recipeTitle: testCase.input.recipeTitle,
          stepTitle: testCase.input.stepTitle,
          memory:
            testCase.input.memory?.map((fact) => `- ${fact}`).join("\n") ??
            "- Nothing recorded yet — this may be their first session.",
          dietaryRestrictions:
            testCase.input.dietaryRestrictions?.join(", ") || "none",
          allergies: testCase.input.allergies?.join(", ") || "none",
          pantry: testCase.input.pantry?.join(", ") || "none",
          adjustments: JSON.stringify(testCase.input.adjustments ?? []),
        }),
        prompt: testCase.input.question,
      });
      const latencyMs = performance.now() - startedAt;
      const object = generated.object;
      const answer = object.answer.toLowerCase();
      const problems: string[] = [];

      if (testCase.expect.maxSentences !== undefined) {
        const sentences = object.answer
          .split(/[.!?]+/)
          .filter((sentence) => sentence.trim().length > 0);
        if (sentences.length > testCase.expect.maxSentences) {
          problems.push(
            `answer had ${sentences.length} sentences (max ${testCase.expect.maxSentences})`,
          );
        }
      }
      for (const required of testCase.expect.mustContain ?? []) {
        if (!answer.includes(required.toLowerCase())) {
          problems.push(`answer did not mention "${required}"`);
        }
      }
      for (const alternatives of testCase.expect.mustContainAny ?? []) {
        if (
          !alternatives.some((value) => answer.includes(value.toLowerCase()))
        ) {
          problems.push(
            `answer did not mention any of: ${alternatives.join(", ")}`,
          );
        }
      }
      for (const forbidden of testCase.expect.mustNotContain ?? []) {
        if (answer.includes(forbidden.toLowerCase())) {
          problems.push(`answer mentioned forbidden item "${forbidden}"`);
        }
      }
      if (
        testCase.expect.actionType !== undefined &&
        object.action?.type !== testCase.expect.actionType
      ) {
        problems.push(
          `expected action ${testCase.expect.actionType}, got ${object.action?.type ?? "none"}`,
        );
      }
      if (
        testCase.expect.timerSeconds !== undefined &&
        object.action?.timerSeconds !== testCase.expect.timerSeconds
      ) {
        problems.push(
          `expected ${testCase.expect.timerSeconds}s timer, got ${object.action?.timerSeconds ?? "none"}`,
        );
      }
      if (
        testCase.expect.stepIndex !== undefined &&
        object.action?.stepIndex !== testCase.expect.stepIndex
      ) {
        problems.push(
          `expected step ${testCase.expect.stepIndex}, got ${object.action?.stepIndex ?? "none"}`,
        );
      }

      const inputTokens = generated.usage?.inputTokens ?? 0;
      const outputTokens = generated.usage?.outputTokens ?? 0;
      const totalTokens = inputTokens + outputTokens;
      const cost = estimateCost(modelName, inputTokens, outputTokens);
      const result: EvalResult = {
        dataset: "assistant",
        name: testCase.name,
        run,
        passed: problems.length === 0,
        safetyCritical: testCase.safetyCritical ?? false,
        problems,
        latencyMs,
        inputTokens,
        outputTokens,
        totalTokens,
        costUsd: cost.usd,
        output: object,
      };
      results.push(result);
      console.log(
        `${result.passed ? "PASS" : "FAIL"}  ${testCase.name} [run ${run}]  (${totalTokens} tokens, ${latencyMs.toFixed(0)}ms, $${cost.usd.toFixed(5)})`,
      );
      for (const problem of problems) console.log(`      - ${problem}`);
    }
  }

  return createReport("assistant", provider, "live", runsPerCase, results);
}

function printSummary(report: SuiteReport) {
  console.log(
    `\n${report.dataset}: ${report.passed}/${report.total} passed (${(report.passRate * 100).toFixed(1)}%) · safety ${(report.safetyPassRate * 100).toFixed(1)}% · avg ${report.avgLatencyMs.toFixed(0)}ms · p95 ${report.p95LatencyMs.toFixed(0)}ms · $${report.totalCostUsd.toFixed(5)}`,
  );
  console.log(`Report written to ${writeReport(report)}`);
}

async function runForProvider(
  dataset: string,
  provider: AiProvider,
  runsPerCase: number,
  offline: boolean,
): Promise<SuiteReport[]> {
  if (offline && dataset !== "recommendations") {
    throw new Error("--offline is only available for recommendations");
  }
  if (dataset === "recommendations") {
    return [await runRecommendations(provider, runsPerCase, offline)];
  }
  if (dataset === "assistant") {
    return [await runAssistant(provider, runsPerCase)];
  }
  if (dataset === "all") {
    return [
      await runRecommendations(provider, runsPerCase, false),
      await runAssistant(provider, runsPerCase),
    ];
  }
  throw new Error(`Unknown eval dataset "${dataset}"`);
}

async function main() {
  const args = process.argv.slice(2);
  const reportMode = args.includes("--report");
  const offline = args.includes("--offline");
  const dataset = args.find((arg) => !arg.startsWith("-")) ?? "all";
  const runsPerCase = Math.max(
    1,
    Math.min(10, Number.parseInt(process.env.EVAL_RUNS ?? "1", 10) || 1),
  );

  if (reportMode) {
    const comparison: Array<{
      provider: AiProvider;
      suites?: SuiteReport[];
      error?: string;
    }> = [];
    for (const provider of AI_PROVIDERS) {
      try {
        comparison.push({
          provider,
          suites: await runForProvider("all", provider, runsPerCase, false),
        });
      } catch (error) {
        comparison.push({
          provider,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    mkdirSync(RESULTS_DIR, { recursive: true });
    const file = path.join(RESULTS_DIR, "text-model-comparison.json");
    writeFileSync(
      file,
      JSON.stringify(
        { ranAt: new Date().toISOString(), runsPerCase, providers: comparison },
        null,
        2,
      ),
    );
    console.log(`\nComparison report written to ${file}`);
    return;
  }

  const provider = (process.env.AI_PROVIDER as AiProvider) ?? "google";
  const reports = await runForProvider(dataset, provider, runsPerCase, offline);
  reports.forEach(printSummary);
  if (reports.some((report) => report.failed > 0)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
