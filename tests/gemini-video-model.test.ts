import { afterEach, describe, expect, it } from "vitest";
import { getGeminiVideoModel, getGeminiVideoModelName } from "@/lib/ai/model";

const originalVideoModel = process.env.GOOGLE_VIDEO_MODEL;

afterEach(() => {
  if (originalVideoModel === undefined) delete process.env.GOOGLE_VIDEO_MODEL;
  else process.env.GOOGLE_VIDEO_MODEL = originalVideoModel;
});

describe("Gemini video model", () => {
  it("uses Gemini Interactions for the approved YouTube-capable model", () => {
    delete process.env.GOOGLE_VIDEO_MODEL;

    const model = getGeminiVideoModel() as unknown as {
      provider: string;
      modelId: string;
    };

    expect(getGeminiVideoModelName()).toBe("gemini-3.8-flash");
    expect(model.provider).toContain("google");
    expect(model.provider).toContain("interactions");
    expect(model.modelId).toBe("gemini-3.8-flash");
  });

  it("rejects a video model outside the application allowlist", () => {
    process.env.GOOGLE_VIDEO_MODEL = "gemini-unapproved";

    expect(() => getGeminiVideoModelName()).toThrow(
      "Configured Gemini video model is not in the application allowlist",
    );
  });
});
