import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  adminFrom: vi.fn(),
  adminSelect: vi.fn(),
  adminEq: vi.fn(),
  adminMaybeSingle: vi.fn(),
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
  createAdminClient: vi.fn(() => ({ from: mocks.adminFrom })),
}));
vi.mock("workflow/api", () => ({ start: mocks.start }));
vi.mock("../workflows/recipe-verification", () => ({
  recipeVerificationWorkflow: vi.fn(),
}));

import { POST } from "@/app/api/recipe-drafts/route";

describe("recipe draft daily quota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-a" } } });
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001" } });
    const adminQuery = {
      select: mocks.adminSelect,
      eq: mocks.adminEq,
      maybeSingle: mocks.adminMaybeSingle,
    };
    mocks.adminFrom.mockReturnValue(adminQuery);
    mocks.adminSelect.mockReturnValue(adminQuery);
    mocks.adminEq.mockReturnValue(adminQuery);
    mocks.adminMaybeSingle.mockResolvedValue({
      data: { id: "11111111-1111-4111-8111-111111111111", sha256: "test" },
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
        details: { required: 6 },
      },
    });
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("reports the seven-unit photo cost without reading a second quota value", async () => {
    const inputId = "11111111-1111-4111-8111-111111111111";
    const response = await POST(
      new Request("http://localhost/api/recipe-drafts", {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          kind: "photo",
          inputId,
          idempotencyKey: crypto.randomUUID(),
        }),
      }),
    );
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      error: {
        code: "RATE_LIMITED",
        message: expect.stringContaining("7 daily AI credits"),
        details: { required: 7 },
      },
    });
    expect(mocks.adminFrom).toHaveBeenCalledWith("recipe_inputs");
    expect(mocks.rpc).toHaveBeenCalledWith("create_recipe_draft", {
      p_kind: "photo",
      p_request: {},
      p_input_id: inputId,
      p_idempotency_key: expect.any(String),
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
