/**
 * Eval runner: executes the datasets in evals/datasets/ against the
 * configured provider (AI_PROVIDER) and scores simple, checkable criteria.
 *
 * Usage:
 *   npm run eval                      # all datasets
 *   npm run eval -- suggest-recipes   # one dataset
 *
 * Requires an API key in .env.local. Extend each case's `expect` block as the
 * checks get richer — these results feed the LLMOps milestone writeup.
 */

try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local not present — rely on real env vars
}

import { readFileSync } from "node:fs";
import path from "node:path";

interface SuggestRecipesExpect {
  maxMissingIngredients?: number;
  maxPrepPlusCookMinutes?: number;
  maxDifficulty?: "easy" | "medium" | "hard";
  mustNotContain?: string[];
}

interface EvalCase {
  name: string;
  input: Record<string, unknown>;
  expect: SuggestRecipesExpect;
}

const DIFFICULTY_RANK = { easy: 1, medium: 2, hard: 3 } as const;

async function main() {
  const datasetArg = process.argv[2];
  const datasetsDir = path.join(process.cwd(), "evals", "datasets");
  const datasetFile = path.join(
    datasetsDir,
    `${datasetArg ?? "suggest-recipes"}.jsonl`,
  );

  const cases: EvalCase[] = readFileSync(datasetFile, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as EvalCase);

  const { getModel, getProvider, getModelName } =
    await import("../src/lib/ai/model");
  const { generateObject } = await import("ai");
  const { recipeSuggestionsSchema } =
    await import("../src/lib/ai/schemas/recipe");
  const { renderPrompt } = await import("../src/lib/ai/prompts");

  console.log(
    `Running ${cases.length} case(s) from ${path.basename(datasetFile)} ` +
      `with ${getProvider()}/${getModelName()}\n`,
  );

  let failures = 0;

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

    const { object, usage } = await generateObject({
      model: getModel(),
      schema: recipeSuggestionsSchema,
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

    const status = problems.length === 0 ? "PASS" : "FAIL";
    if (problems.length) failures++;
    console.log(
      `${status}  ${c.name}  (${object.suggestions.length} suggestions, ${usage?.totalTokens ?? "?"} tokens)`,
    );
    for (const p of problems) console.log(`      - ${p}`);
  }

  console.log(`\n${cases.length - failures}/${cases.length} cases passed`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
