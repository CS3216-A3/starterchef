import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  query: { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
    rpc: mocks.rpc,
  })),
}));

import { POST } from "@/app/api/cooking-sessions/[id]/adjustments/route";

const sessionId = "2fd58ee4-8868-4b78-8337-b3aa93da3dd9";
const url = `http://localhost/api/cooking-sessions/${sessionId}/adjustments`;
const proposal = {
  stepIndex: 1,
  title: "Step adjustment",
  detail: "Use a rice cooker instead of the pot.",
  replacementInstruction:
    "Add the rinsed rice and water to the rice cooker and cook until tender.",
};

function request(body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { origin: "http://localhost", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("confirmed cooking adjustments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } } });
    mocks.from.mockReturnValue(mocks.query);
    mocks.query.select.mockReturnValue(mocks.query);
    mocks.query.eq.mockReturnValue(mocks.query);
    mocks.query.maybeSingle.mockResolvedValue({
      data: { recipe: { steps: [{ index: 1, instruction: "Boil rice." }] } },
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: { conflict: false, session: { version: 5 } },
      error: null,
    });
  });

  it("sends the complete replacement instruction to the versioned RPC", async () => {
    const response = await POST(request({ proposal, expectedVersion: 4 }));
    expect(response.status).toBe(200);
    expect(mocks.query.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(mocks.rpc).toHaveBeenCalledWith("append_cooking_adjustment", {
      p_session_id: sessionId,
      p_adjustment: proposal,
      p_expected_version: 4,
    });
  });

  it("rejects vague proposals before calling the RPC", async () => {
    const vague = {
      stepIndex: proposal.stepIndex,
      title: proposal.title,
      detail: proposal.detail,
    };
    const response = await POST(
      request({ proposal: vague, expectedVersion: 4 }),
    );
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not let another user mutate the session", async () => {
    mocks.query.maybeSingle.mockResolvedValue({ data: null, error: null });
    const response = await POST(request({ proposal, expectedVersion: 4 }));
    expect(response.status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns a version conflict without claiming the change applied", async () => {
    mocks.rpc.mockResolvedValue({
      data: { conflict: true, session: { version: 5 } },
      error: null,
    });
    const response = await POST(request({ proposal, expectedVersion: 4 }));
    expect(response.status).toBe(409);
  });
});
