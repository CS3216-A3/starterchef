import { describe, expect, it } from "vitest";
import { voiceActionSchema } from "@/lib/ai/schemas/assistant";

describe("voice action proposals", () => {
  it("accepts bounded, explicit proposals", () => {
    expect(
      voiceActionSchema.safeParse({ type: "set-timer", timerSeconds: 90 })
        .success,
    ).toBe(true);
    expect(
      voiceActionSchema.safeParse({
        type: "adjust-step",
        detail: "Stir for one more minute.",
      }).success,
    ).toBe(true);
    expect(
      voiceActionSchema.safeParse({ type: "goto-step", stepIndex: 2 }).success,
    ).toBe(true);
  });

  it("rejects missing details, unbounded timers, and mutating extras", () => {
    expect(voiceActionSchema.safeParse({ type: "adjust-step" }).success).toBe(
      false,
    );
    expect(
      voiceActionSchema.safeParse({ type: "set-timer", timerSeconds: 100000 })
        .success,
    ).toBe(false);
    expect(
      voiceActionSchema.safeParse({
        type: "goto-step",
        stepIndex: 1,
        accepted: true,
      }).success,
    ).toBe(false);
  });
});
