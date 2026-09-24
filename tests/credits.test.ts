import { describe, expect, it } from "vitest";
import {
  CORE_FEATURES,
  CREDITS_PER_TYPICAL_COOK,
  CREDIT_COSTS,
  FEATURE_ROWS,
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

  it("gives Free at least one full cook a month, but strictly fewer than Plus", () => {
    const free = PLANS.find((p) => p.id === "free")!;
    const plus = PLANS.find((p) => p.id === "plus")!;
    expect(approxCooks(free.credits)).toBeGreaterThanOrEqual(1);
    expect(free.credits).toBeLessThan(plus.credits);
  });

  it("covers well over a cook a week on Plus", () => {
    const plus = PLANS.find((p) => p.id === "plus")!;
    expect(approxCooks(plus.credits)).toBeGreaterThanOrEqual(4);
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

describe("launch feature comparison", () => {
  it("lists at least one core feature shared by every plan", () => {
    expect(CORE_FEATURES.length).toBeGreaterThan(0);
  });

  it("gives Plus a real, non-empty upgrade over Free on every gated row", () => {
    for (const row of FEATURE_ROWS) {
      expect(row.plus).not.toBe("");
      expect(row.plus).not.toBe(row.free);
    }
  });

  it("locks at least one feature entirely behind Plus", () => {
    expect(FEATURE_ROWS.some((row) => row.free === "—")).toBe(true);
  });
});
