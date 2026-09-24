import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
  insert: vi.fn(),
  flush: vi.fn(),
}));
vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  generateObject: mocks.generateObject,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ insert: mocks.insert }) }),
}));
vi.mock("@/lib/posthog/server", () => ({ flushPostHogAI: mocks.flush }));

import {
  measuredGenerate,
  type MeasuredGenerateArgs,
} from "@/lib/ai/instrument";

const secretRecipe = "synthetic-secret-recipe-7491";
const secretAllergy = "synthetic-secret-allergy-9372";
const args = {
  model: {} as MeasuredGenerateArgs["model"],
  prompt: `${secretRecipe} ${secretAllergy}`,
  schema: {} as never,
} as MeasuredGenerateArgs;

describe("AI telemetry redaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockResolvedValue({ error: null });
    mocks.flush.mockResolvedValue(undefined);
  });

  it("disables SDK input/output span attributes and stores metadata only", async () => {
    mocks.generateObject.mockResolvedValue({
      usage: { inputTokens: 9, outputTokens: 3 },
    });
    await measuredGenerate("test-recipe", args, {
      provider: "openai",
      model: "gpt-test",
    });
    expect(mocks.generateObject.mock.calls[0][0].telemetry).toMatchObject({
      recordInputs: false,
      recordOutputs: false,
    });
    expect(mocks.insert).toHaveBeenCalledOnce();
    const exported = JSON.stringify(mocks.insert.mock.calls[0][0]);
    expect(exported).not.toContain(secretRecipe);
    expect(exported).not.toContain(secretAllergy);
    expect(mocks.insert.mock.calls[0][0].outcome).toBe("success");
  });

  it("stores a safe failure code without exporting the provider error", async () => {
    mocks.generateObject.mockRejectedValue(
      new Error(`${secretRecipe} ${secretAllergy}`),
    );
    await expect(
      measuredGenerate("test-recipe", args, {
        provider: "openai",
        model: "gpt-test",
      }),
    ).rejects.toThrow();
    const exported = JSON.stringify(mocks.insert.mock.calls[0][0]);
    expect(exported).not.toContain(secretRecipe);
    expect(exported).not.toContain(secretAllergy);
    expect(mocks.insert.mock.calls[0][0].error_code).toBe("GENERATION_FAILED");
  });
});
