import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  start: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    from: mocks.from,
  })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({})),
}));
vi.mock("workflow/api", () => ({ start: mocks.start }));
vi.mock("../workflows/recipe-verification", () => ({
  recipeVerificationWorkflow: vi.fn(),
}));

import { POST } from "@/app/api/recipe-drafts/route";

describe("recipe draft daily quota", () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AI_DAILY_LIMIT", "50");
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-a" } } });
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001" } });
    const query = {
      select: mocks.select,
      eq: mocks.eq,
      maybeSingle: mocks.maybeSingle,
    };
    mocks.from.mockReturnValue(query);
    mocks.select.mockReturnValue(query);
    mocks.eq.mockReturnValue(query);
    mocks.maybeSingle.mockResolvedValue({
      data: { date: new Date().toISOString().slice(0, 10), count: 45 },
      error: null,
    });
  });

  it("explains a six-unit draft rejection without starting a workflow", async () => {
    const response = await POST(
      new Request("http://localhost/api/recipe-drafts", {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          kind: "text",
          content: "Boil pasta in water for ten minutes.",
          idempotencyKey: crypto.randomUUID(),
        }),
      }),
    );
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      error: {
        code: "RATE_LIMITED",
        details: { required: 6, remaining: 5, limit: 50 },
      },
    });
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(mocks.from).toHaveBeenCalledWith("ai_usage_quota");
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "user-a");
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
