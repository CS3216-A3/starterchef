import { describe, expect, it } from "vitest";
import {
  CREDITS_PER_TYPICAL_COOK,
  CREDIT_COSTS,
  PLANS,
  SGD_PER_USD,
  TOP_UPS,
  approxCooks,
  creditCostFor,
  creditsToUsd,
} from "@/lib/credits";

describe("credit costs", () => {
  it("charges duration-billed actions by length, rounding up", () => {
    expect(creditCostFor("import_video", { videoSeconds: 30 })).toBe(44);
    expect(creditCostFor("import_video", { videoSeconds: 31 })).toBe(88);
    expect(creditCostFor("import_video", { videoSeconds: 180 })).toBe(264);
    expect(creditCostFor("live_voice_minute", { voiceSeconds: 90 })).toBe(240);
  });

  it("never charges less than one block for a zero-length duration", () => {
    expect(creditCostFor("import_video", { videoSeconds: 0 })).toBe(44);
    expect(creditCostFor("live_voice_minute", { voiceSeconds: 0 })).toBe(120);
  });

  it("keeps vision and multi-turn actions dearer than plain text parses", () => {
    expect(CREDIT_COSTS.kitchen_scan).toBeGreaterThan(
      CREDIT_COSTS.kitchen_voice,
    );
    expect(CREDIT_COSTS.edit_recipe).toBeGreaterThan(CREDIT_COSTS.adapt_recipe);
    expect(CREDIT_COSTS.live_voice_minute).toBeGreaterThan(
      CREDIT_COSTS.import_text,
    );
  });
});

describe("plan economics", () => {
  it("leaves positive gross margin on every paid plan", () => {
    for (const plan of PLANS.filter((p) => p.priceSgd > 0)) {
      const revenueUsd = plan.priceSgd / SGD_PER_USD;
      expect(creditsToUsd(plan.credits)).toBeLessThan(revenueUsd);
    }
    for (const topUp of TOP_UPS) {
      const revenueUsd = topUp.priceSgd / SGD_PER_USD;
      expect(creditsToUsd(topUp.credits)).toBeLessThan(revenueUsd);
    }
  });

  it("prices a subscription credit below any top-up credit, so the ladder holds", () => {
    const plus = PLANS.find((p) => p.id === "plus")!;
    const plusPerCredit = plus.priceSgd / plus.credits;
    for (const topUp of TOP_UPS) {
      expect(plusPerCredit).toBeLessThan(topUp.priceSgd / topUp.credits);
    }
  });

  it("discounts the annual plan against paying monthly", () => {
    const plus = PLANS.find((p) => p.id === "plus")!;
    expect(plus.annualPriceSgd).toBeLessThan(plus.priceSgd * 12);
  });

  it("gives the free tier enough credits for a few AI-assisted cooks a month", () => {
    const free = PLANS.find((p) => p.id === "free")!;
    expect(free.recurring).toBe(true);
    expect(approxCooks(free.credits)).toBeGreaterThanOrEqual(3);
    expect(approxCooks(free.credits)).toBeLessThan(10);
  });

  it("covers roughly a cook a day on Plus", () => {
    const plus = PLANS.find((p) => p.id === "plus")!;
    expect(approxCooks(plus.credits)).toBeGreaterThanOrEqual(28);
  });

  it("derives a typical cook from its component actions", () => {
    expect(CREDITS_PER_TYPICAL_COOK).toBe(
      CREDIT_COSTS.suggest_recipes +
        CREDIT_COSTS.assistant_question * 4 +
        CREDIT_COSTS.step_check +
        CREDIT_COSTS.session_recap,
    );
  });
});
