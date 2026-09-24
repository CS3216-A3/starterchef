import { describe, expect, it } from "vitest";
import { recipeSafetyFailure } from "@/lib/validation/recipe-safety";

describe("deterministic recipe safety", () => {
  const safe = {
    ingredients: ["rice", "water"],
    steps: [{ instruction: "Simmer until tender." }],
  };

  it("allows a recipe without known conflicts", () => {
    expect(recipeSafetyFailure(safe, { allergies: ["peanut"] })).toBeNull();
  });

  it("blocks a listed allergen or restriction in ingredients", () => {
    expect(
      recipeSafetyFailure(
        { ...safe, ingredients: ["peanut butter"] },
        { allergies: ["peanut"] },
      ),
    ).toBe("DIET_OR_ALLERGEN_CONFLICT");
  });

  it("blocks known unsafe cooking directions", () => {
    expect(
      recipeSafetyFailure(
        { ...safe, steps: [{ instruction: "Eat raw chicken." }] },
        null,
      ),
    ).toBe("UNSAFE_INSTRUCTION");
    expect(
      recipeSafetyFailure(
        {
          ...safe,
          steps: [
            {
              instruction: "Leave raw chicken on the counter for three hours.",
            },
          ],
        },
        null,
      ),
    ).toBe("UNSAFE_INSTRUCTION");
  });
});
