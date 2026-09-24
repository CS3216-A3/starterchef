import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  start: vi.fn(),
  adminFrom: vi.fn(),
  adminQuery: { update: vi.fn(), eq: vi.fn() },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mocks.adminFrom }),
}));
vi.mock("workflow/api", () => ({ start: mocks.start }));
vi.mock("../workflows/recipe-verification", () => ({
  recipeVerificationWorkflow: vi.fn(),
}));

import { POST } from "@/app/api/recipe-drafts/[id]/tailor/route";

const draftId = "9390a987-271b-48c3-9fd1-5c424fbe5be9";
const attemptId = "f79077c4-df48-4c37-ac6e-17cfdc660ae3";
const key = "1da39d30-9747-4fe7-a5c8-ab63820e6ddb";

function request() {
  return new Request(`http://localhost/api/recipe-drafts/${draftId}/tailor`, {
    method: "POST",
    headers: { origin: "http://localhost", "Content-Type": "application/json" },
    body: JSON.stringify({ intent: "Use a rice cooker", idempotencyKey: key }),
  });
}

describe("recipe draft tailoring route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } } });
    mocks.rpc.mockResolvedValue({
      data: {
        draft: { workflow_attempt_id: attemptId, status: "queued" },
        created: true,
      },
      error: null,
    });
    mocks.start.mockResolvedValue({ runId: "run-1" });
    mocks.adminFrom.mockReturnValue(mocks.adminQuery);
    mocks.adminQuery.update.mockReturnValue(mocks.adminQuery);
    mocks.adminQuery.eq.mockReturnValue(mocks.adminQuery);
  });

  it("starts only the current attempt after the owner-checked RPC", async () => {
    const response = await POST(request());
    expect(response.status).toBe(202);
    expect(mocks.rpc).toHaveBeenCalledWith("tailor_recipe_draft", {
      p_draft_id: draftId,
      p_intent: "Use a rice cooker",
      p_idempotency_key: key,
    });
    expect(mocks.start).toHaveBeenCalledWith(expect.any(Function), [
      draftId,
      attemptId,
    ]);
  });

  it("does not start a duplicate workflow for an idempotent retry", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        draft: { workflow_attempt_id: attemptId, status: "queued" },
        created: false,
      },
      error: null,
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("does not reveal or start another user's draft", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0002" } });
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
