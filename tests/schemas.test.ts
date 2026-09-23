import { describe, expect, it } from "vitest";
import { assistantReplySchema } from "@/lib/ai/schemas/assistant";
import { cookingStepSchema } from "@/lib/ai/schemas/cooking";
import { kitchenScanSchema } from "@/lib/ai/schemas/kitchen-scan";
import { recipeSuggestionsSchema } from "@/lib/ai/schemas/recipe";

describe("kitchenScanSchema", () => {
  it("accepts a valid scan result", () => {
    const result = kitchenScanSchema.safeParse({
      ingredients: [
        {
          name: "Eggs",
          confidence: "high",
          estimatedQuantity: "6",
          expiresWithinDays: null,
          icon: "egg",
        },
      ],
      equipment: [
        { name: "Frying pan", confidence: "medium", icon: "cooking-pot" },
      ],
      uncertainItems: ["possibly butter"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid confidence level", () => {
    const result = kitchenScanSchema.safeParse({
      ingredients: [{ name: "Eggs", confidence: "definitely" }],
      equipment: [],
      uncertainItems: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("recipeSuggestionsSchema", () => {
  const suggestion = {
    title: "Tomato egg stir-fry",
    description: "A classic.",
    prepMinutes: 5,
    cookMinutes: 10,
    servings: 2,
    difficulty: "easy",
    matchedIngredients: ["eggs", "tomatoes"],
    missingIngredients: [],
    requiredEquipment: ["frying pan"],
    whyThisRecipe: "Uses your eggs and tomatoes.",
    tags: ["quick"],
  };

  it("accepts valid suggestions", () => {
    expect(
      recipeSuggestionsSchema.safeParse({ suggestions: [suggestion] }).success,
    ).toBe(true);
  });

  it("rejects an empty suggestion list", () => {
    expect(recipeSuggestionsSchema.safeParse({ suggestions: [] }).success).toBe(
      false,
    );
  });
});

describe("cookingStepSchema", () => {
  it("requires a positive step index", () => {
    expect(
      cookingStepSchema.safeParse({
        index: 0,
        title: "x",
        instruction: "y",
        ingredientsUsed: [],
      }).success,
    ).toBe(false);
  });
});

describe("assistantReplySchema", () => {
  it("accepts a spoken answer with a timer action", () => {
    const result = assistantReplySchema.safeParse({
      answer: "Set a two minute timer.",
      action: { type: "set-timer", timerSeconds: 120 },
    });
    expect(result.success).toBe(true);
  });
});
