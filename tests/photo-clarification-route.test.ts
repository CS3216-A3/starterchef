import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  start: vi.fn(),
  from: vi.fn(),
  query: {
    update: vi.fn(),
    eq: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mocks.from })),
}));
vi.mock("workflow/api", () => ({ start: mocks.start }));
vi.mock("../workflows/recipe-verification", () => ({
  recipeVerificationWorkflow: vi.fn(),
}));

import { POST } from "@/app/api/recipe-drafts/[id]/clarify/route";

const draftId = "934e7ebc-205f-419b-adf8-e47af541ea3c";
const attemptId = "c6601707-03cc-4a0a-9747-38327d48392a";

function request(answer: string) {
  return new Request(`http://localhost/api/recipe-drafts/${draftId}/clarify`, {
    method: "POST",
    headers: { Origin: "http://localhost", "Content-Type": "application/json" },
    body: JSON.stringify({ answer }),
  });
}

describe("photo draft clarification route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } } });
    mocks.rpc.mockResolvedValue({ data: { draftId, attemptId }, error: null });
    mocks.start.mockResolvedValue({ runId: "workflow-run" });
    mocks.from.mockReturnValue(mocks.query);
    mocks.query.update.mockReturnValue(mocks.query);
    mocks.query.eq.mockReturnValue(mocks.query);
  });

  it("requires authentication before accessing the draft", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(request("It is chicken curry"))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects an empty answer without starting a workflow", async () => {
    expect((await POST(request("  "))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("resumes the same draft with its new database attempt", async () => {
    const response = await POST(request("Chicken curry, no peanuts"));
    expect(response.status).toBe(202);
    expect(mocks.rpc).toHaveBeenCalledWith("clarify_recipe_draft", {
      p_draft_id: draftId,
      p_answer: "Chicken curry, no peanuts",
    });
    expect(mocks.start).toHaveBeenCalledWith(expect.any(Function), [
      draftId,
      attemptId,
    ]);
    expect(await response.json()).toEqual({ draftId, status: "queued" });
  });

  it("keeps an expired or already answered draft as a conflict", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "22023" } });
    expect((await POST(request("Chicken curry"))).status).toBe(409);
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
