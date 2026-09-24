import { describe, expect, it } from "vitest";
import { POST as suggestRecipes } from "@/app/api/ai/suggest-recipes/route";
import { POST as assistant } from "@/app/api/ai/assistant/route";

/**
 * Smoke tests for AI routes. These make real calls to the configured AI
 * provider and are skipped by default to avoid burning API credits during
 * normal test runs.
 *
 * To run them locally:
 *   RUN_AI_SMOKE=true npm test
 *
 * Requires the provider key in .env.local (e.g. GOOGLE_GENERATIVE_AI_API_KEY).
 */

const run = process.env.RUN_AI_SMOKE === "true";

describe.skipIf(!run)("AI route smoke tests", () => {
  it("suggest-recipes returns a ranked list", async () => {
    const res = await suggestRecipes(
      new Request("http://localhost/api/ai/suggest-recipes", {
        method: "POST",
        body: JSON.stringify({
          ingredients: ["egg", "tomato", "rice"],
          equipment: ["pan", "knife"],
          dietaryRestrictions: [],
          allergies: [],
          tastePreferences: ["savoury"],
          skillLevel: "beginner",
          timeMinutes: 30,
          servings: 2,
        }),
      }),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as { suggestions: unknown[] };
    expect(Array.isArray(data.suggestions)).toBe(true);
    expect(data.suggestions.length).toBeGreaterThan(0);
  });

  it("assistant answers a cooking question", async () => {
    const res = await assistant(
      new Request("http://localhost/api/ai/assistant", {
        method: "POST",
        body: JSON.stringify({
          question: "What should I do if the egg sticks to the pan?",
          context: {
            recipeTitle: "Tomato Egg Stir-Fry",
            stepTitle: "Fry the eggs",
          },
        }),
      }),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as { answer: string };
    expect(typeof data.answer).toBe("string");
    expect(data.answer.length).toBeGreaterThan(0);
  });
});
