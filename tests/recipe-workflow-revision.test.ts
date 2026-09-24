import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  measuredGenerate: vi.fn(),
  draft: {} as Record<string, unknown>,
}));

vi.mock("workflow", () => ({ FatalError: class FatalError extends Error {} }));
vi.mock("@/lib/ai/instrument", () => ({
  measuredGenerate: mocks.measuredGenerate,
}));
vi.mock("@/lib/ai/model", () => ({
  getProvider: () => "openai",
  getModel: () => ({}),
  getGeminiVideoModel: () => ({}),
  getGeminiVideoModelName: () => "unused",
}));
vi.mock("@/lib/ai/prompts", () => ({ renderPrompt: () => "system prompt" }));

const recipe = {
  title: "Chicken and rice",
  description: "A simple meal",
  minutes: 35,
  difficulty: "easy",
  servings: 2,
  ingredients: ["300g chicken", "1 cup rice"],
  equipment: ["pot", "pan", "thermometer"],
  steps: [
    {
      index: 1,
      title: "Cook chicken",
      instruction: "Cook chicken to 74°C / 165°F internally.",
      durationSeconds: 900,
      ingredientsUsed: ["300g chicken"],
      tip: null,
      photoCheckpoint: null,
    },
    {
      index: 2,
      title: "Cook rice",
      instruction: "Boil the rice until tender.",
      durationSeconds: 1200,
      ingredientsUsed: ["1 cup rice"],
      tip: null,
      photoCheckpoint: null,
    },
  ],
  tags: [],
  whyGood: null,
};

class Query {
  private changes: Record<string, unknown> | null = null;
  private filters: [string, unknown][] = [];

  constructor(private table: string) {}
  select() {
    return this;
  }
  update(changes: Record<string, unknown>) {
    this.changes = changes;
    return this;
  }
  eq(key: string, value: unknown) {
    this.filters.push([key, value]);
    return this;
  }
  maybeSingle() {
    return Promise.resolve(this.execute());
  }
  then(
    resolve: (value: unknown) => unknown,
    reject: (error: unknown) => unknown,
  ) {
    return Promise.resolve(this.execute()).then(resolve, reject);
  }

  private execute() {
    if (this.table === "profiles")
      return { data: { dietary_restrictions: [], allergies: [] }, error: null };
    if (this.table !== "recipe_drafts") return { data: null, error: null };
    const matches = this.filters.every(
      ([key, value]) => mocks.draft[key] === value,
    );
    if (!matches) return { data: null, error: null };
    if (this.changes) Object.assign(mocks.draft, this.changes);
    return { data: { ...mocks.draft }, error: null };
  }
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => new Query(table) }),
}));

import { recipeVerificationWorkflow } from "../workflows/recipe-verification";

const draftId = "6fbd7894-714b-4a66-a071-5e8836b882d1";
const attemptId = "f79077c4-df48-4c37-ac6e-17cfdc660ae3";

describe("recipe workflow revision ceiling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("RECIPE_VERIFICATION_ROUTING", "single");
    mocks.draft = {
      id: draftId,
      user_id: "owner",
      kind: "generated",
      status: "queued",
      request: {},
      input_id: null,
      canonical_recipe: recipe,
      verification: {},
      retry_count: 0,
      workflow_attempt_id: attemptId,
    };
  });

  it("does not make a second adjudication call after the one revision is spent", async () => {
    mocks.measuredGenerate
      .mockResolvedValueOnce({
        object: { verdict: "revise", summary: "Fix timing", findings: [] },
      })
      .mockResolvedValueOnce({
        object: {
          verdict: "revise",
          summary: "Timing fixed",
          findings: [],
          revisedRecipe: recipe,
        },
      })
      .mockResolvedValueOnce({
        object: {
          verdict: "revise",
          summary: "Another correction needed",
          findings: [],
        },
      });

    await expect(
      recipeVerificationWorkflow(draftId, attemptId),
    ).rejects.toThrow("Final verifier requested a second revision");
    expect(mocks.measuredGenerate.mock.calls.map(([name]) => name)).toEqual([
      "recipe-initial-verification",
      "recipe-adjudication",
      "recipe-final-verification",
    ]);
    expect(mocks.draft).toMatchObject({
      status: "blocked",
      failure_code: "FINAL_REVISION_UNRESOLVED",
      retry_count: 1,
    });
  });

  it("still terminates an initial critical block before adjudication", async () => {
    mocks.measuredGenerate.mockResolvedValueOnce({
      object: {
        verdict: "block",
        summary: "Unsafe source",
        findings: [
          {
            severity: "critical",
            category: "safety",
            message: "Unsafe source",
          },
        ],
      },
    });

    await expect(
      recipeVerificationWorkflow(draftId, attemptId),
    ).rejects.toThrow("initial independent verification failed");
    expect(mocks.measuredGenerate).toHaveBeenCalledTimes(1);
    expect(mocks.draft).toMatchObject({
      status: "blocked",
      failure_code: "INITIAL_INDEPENDENT_VERIFIER_BLOCKED",
    });
  });

  it("generates a tailored candidate and requires a new final verifier pass", async () => {
    mocks.draft.canonical_recipe = null;
    mocks.draft.tailoring_source = recipe;
    mocks.draft.tailoring_intent = "Use a rice cooker for the rice";
    mocks.measuredGenerate
      .mockResolvedValueOnce({ object: recipe })
      .mockResolvedValueOnce({
        object: { verdict: "pass", summary: "Complete", findings: [] },
      })
      .mockResolvedValueOnce({
        object: {
          verdict: "pass",
          summary: "No revision needed",
          findings: [],
          revisedRecipe: null,
        },
      })
      .mockResolvedValueOnce({
        object: { verdict: "pass", summary: "Safe to cook", findings: [] },
      });

    await recipeVerificationWorkflow(draftId, attemptId);
    expect(mocks.measuredGenerate.mock.calls.map(([name]) => name)).toEqual([
      "recipe-tailoring",
      "recipe-initial-verification",
      "recipe-adjudication",
      "recipe-final-verification",
    ]);
    expect(mocks.draft).toMatchObject({
      status: "awaiting_user_acceptance",
      retry_count: 0,
    });
  });
});
