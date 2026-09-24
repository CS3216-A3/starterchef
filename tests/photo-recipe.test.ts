import { describe, expect, it } from "vitest";
import {
  photoRecipeResultSchema,
  photoSourceAssessmentSchema,
} from "@/lib/ai/schemas/photo-recipe";
import { importedRecipeSchema } from "@/lib/ai/schemas/import";
import {
  applyPhotoCompleteness,
  photoRecipeCompletenessFindings,
  requirePhotoClarification,
} from "@/lib/validation/photo-recipe";

const recipe = importedRecipeSchema.parse({
  title: "Chicken curry with rice",
  description: "A home-cook approximation from a dish photo.",
  minutes: 35,
  difficulty: "easy",
  servings: 2,
  ingredients: ["300g raw chicken", "1 cup rice", "1 cup curry sauce"],
  equipment: ["pot", "pan", "food thermometer"],
  steps: [
    {
      index: 1,
      title: "Cook rice",
      instruction: "Cook the rice.",
      durationSeconds: 900,
      ingredientsUsed: ["1 cup rice"],
      tip: null,
      photoCheckpoint: null,
    },
    {
      index: 2,
      title: "Cook chicken",
      instruction: "Cook the chicken until its center reaches 74°C / 165°F.",
      durationSeconds: 900,
      ingredientsUsed: ["300g raw chicken"],
      tip: null,
      photoCheckpoint: null,
    },
    {
      index: 3,
      title: "Finish curry",
      instruction: "Add the sauce and simmer.",
      durationSeconds: 300,
      ingredientsUsed: ["1 cup curry sauce"],
      tip: null,
      photoCheckpoint: null,
    },
  ],
  tags: [],
  whyGood: null,
});

describe("photo recipe contracts", () => {
  it("validates the two source modes and a targeted clarification", () => {
    expect(
      photoSourceAssessmentSchema.safeParse({
        sourceType: "finished_dish",
        summary: "A chicken curry with rice",
        visibleFacts: ["rice", "chicken pieces"],
        uncertainties: ["curry sauce ingredients"],
        clarificationQuestion: "Does the sauce contain peanuts?",
      }).success,
    ).toBe(true);
    expect(
      photoSourceAssessmentSchema.safeParse({
        sourceType: "unknown",
        summary: "dish",
        visibleFacts: [],
        uncertainties: [],
        clarificationQuestion: null,
      }).success,
    ).toBe(false);
  });

  it("asks for detail when a photo is unusable or allergy-sensitive", () => {
    const base = {
      sourceType: "finished_dish" as const,
      summary: "Curry",
      visibleFacts: ["chicken"],
      uncertainties: ["sauce"],
      clarificationQuestion: null,
    };
    expect(
      requirePhotoClarification(base, ["peanuts"]).clarificationQuestion,
    ).toContain("allergens");
    expect(
      requirePhotoClarification({ ...base, sourceType: "unusable" }, [])
        .clarificationQuestion,
    ).toContain("not clear enough");
    expect(
      requirePhotoClarification(base, []).clarificationQuestion,
    ).toBeNull();
  });

  it("requires a complete structured recipe and explicit assumptions", () => {
    const canonical = JSON.parse(
      JSON.stringify(recipe, (_key, value) =>
        value === undefined ? null : value,
      ),
    );
    expect(
      photoRecipeResultSchema.safeParse({
        recipe: canonical,
        assumptions: ["The curry uses a mild sauce."],
      }).success,
    ).toBe(true);
    expect(
      photoRecipeResultSchema.safeParse({
        recipe: { title: "A curry photo" },
        assumptions: [],
      }).success,
    ).toBe(false);
  });

  it("rejects a one-minute description with missing equipment and poultry safety", () => {
    const incomplete = {
      ...recipe,
      minutes: 1,
      equipment: [],
      steps: [
        {
          ...recipe.steps[0],
          instruction: "Serve chicken pieces with rice.",
          durationSeconds: 60,
        },
      ],
    };
    expect(
      photoRecipeCompletenessFindings(incomplete, "finished_dish"),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("at least three"),
        expect.stringContaining("equipment"),
        expect.stringContaining("74°C"),
      ]),
    );
  });

  it("allows a complete chicken dish and a precooked poultry ingredient", () => {
    expect(photoRecipeCompletenessFindings(recipe, "finished_dish")).toEqual(
      [],
    );
    expect(
      photoRecipeCompletenessFindings(
        {
          ...recipe,
          ingredients: ["200g precooked chicken"],
          steps: recipe.steps.map((step) => ({
            ...step,
            instruction: "Reheat and serve.",
          })),
        },
        "recipe_card",
      ),
    ).toEqual([]);
  });

  it("turns a false verifier pass into a repairable revision", () => {
    const report = {
      verdict: "pass" as const,
      summary: "Looks fine",
      findings: [],
    };
    expect(
      applyPhotoCompleteness(report, ["Poultry temperature missing"]),
    ).toMatchObject({
      verdict: "revise",
      findings: [
        { severity: "critical", message: "Poultry temperature missing" },
      ],
    });
    expect(
      applyPhotoCompleteness({ ...report, verdict: "block" }, [
        "Unknown allergen",
      ]).verdict,
    ).toBe("block");
  });
});
