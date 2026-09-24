import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  charge: vi.fn(),
  generate: vi.fn(),
}));

vi.mock("@/lib/protected-route", () => ({
  withProtectedRoute: (handler: (context: unknown) => Promise<Response>) =>
    handler,
  protectedError: (
    _context: unknown,
    status: number,
    code: string,
    message: string,
  ) => Response.json({ error: { code, message } }, { status }),
}));
vi.mock("@/lib/ai/cooking-context", () => ({
  loadCookingAssistantContext: mocks.load,
  activeCookingContext: (context: {
    session?: { status?: string; recipe?: { steps?: unknown[] } };
  }) =>
    context.session?.status === "in_progress" &&
    context.session.recipe?.steps?.length
      ? context
      : null,
  cookingPrompt: () => "owned prompt",
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.charge,
  createRateLimitResponse: () => new Response(null, { status: 429 }),
}));
vi.mock("@/lib/ai/instrument", () => ({
  measuredGenerate: mocks.generate,
  safeAiFailureCode: () => "GENERATION_FAILED",
}));
vi.mock("@/lib/ai/model", () => ({ getModel: () => "mock-model" }));
vi.mock("@/lib/session-events", () => ({ logSessionEvent: vi.fn() }));

import { POST } from "@/app/api/ai/assistant/route";

const sessionId = "631d4b15-4723-4c60-833d-bdf7ee817847";
const route = POST as unknown as (context: unknown) => Promise<Response>;

describe("assistant session ownership before quota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.charge.mockResolvedValue({ allowed: true });
  });

  const request = () => ({
    request: new Request("https://starterchef.test/api/ai/assistant", {
      method: "POST",
      body: JSON.stringify({ sessionId, question: "What next?" }),
    }),
    user: { id: "owner" },
    supabase: {},
    requestId: "test",
  });

  it("does not charge or generate for a foreign session", async () => {
    mocks.load.mockResolvedValue({ session: null });
    expect((await route(request())).status).toBe(404);
    expect(mocks.charge).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("does not charge for an incomplete active snapshot", async () => {
    mocks.load.mockResolvedValue({
      session: { status: "in_progress", recipe: { steps: [] } },
    });
    expect((await route(request())).status).toBe(409);
    expect(mocks.charge).not.toHaveBeenCalled();
  });
});
