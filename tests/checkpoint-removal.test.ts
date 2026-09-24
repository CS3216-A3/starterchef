import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const sessionQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  const checkpointQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    delete: vi.fn(),
  };
  return {
    getUser: vi.fn(),
    sessionQuery,
    checkpointQuery,
    remove: vi.fn(),
    fromAdmin: vi.fn(),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: () => mocks.sessionQuery,
  })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: mocks.fromAdmin,
    storage: { from: () => ({ remove: mocks.remove }) },
  }),
}));

import { DELETE } from "@/app/api/cooking-sessions/[id]/checkpoints/route";

const sessionId = "2fd58ee4-8868-4b78-8337-b3aa93da3dd9";
const checkpointId = "7f6a849c-a905-4c5a-aeae-e5f768ea6426";
const request = () =>
  new Request(
    `http://localhost/api/cooking-sessions/${sessionId}/checkpoints?checkpointId=${checkpointId}`,
    { method: "DELETE", headers: { origin: "http://localhost" } },
  );

describe("checkpoint removal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } } });
    mocks.sessionQuery.select.mockReturnValue(mocks.sessionQuery);
    mocks.sessionQuery.eq.mockReturnValue(mocks.sessionQuery);
    mocks.sessionQuery.maybeSingle.mockResolvedValue({
      data: { id: sessionId },
      error: null,
    });
    mocks.checkpointQuery.select.mockReturnValue(mocks.checkpointQuery);
    mocks.checkpointQuery.eq.mockReturnValue(mocks.checkpointQuery);
    mocks.checkpointQuery.delete.mockReturnValue(mocks.checkpointQuery);
    mocks.checkpointQuery.maybeSingle.mockResolvedValue({
      data: {
        id: checkpointId,
        object_path: `owner/checkpoints/${sessionId}/photo.jpg`,
      },
      error: null,
    });
    mocks.fromAdmin.mockReturnValue(mocks.checkpointQuery);
    mocks.remove.mockResolvedValue({ error: null });
  });

  it("retains the row when Storage removal fails", async () => {
    mocks.remove.mockResolvedValue({
      error: { message: "storage unavailable" },
    });
    const response = await DELETE(request());
    expect(response.status).toBe(503);
    expect(mocks.checkpointQuery.delete).not.toHaveBeenCalled();
  });

  it("checks ownership before touching Storage", async () => {
    mocks.checkpointQuery.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    const response = await DELETE(request());
    expect(response.status).toBe(404);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.checkpointQuery.eq).toHaveBeenCalledWith("user_id", "owner");
  });

  it("removes Storage before the owner-scoped row", async () => {
    mocks.checkpointQuery.eq.mockReturnValue(mocks.checkpointQuery);
    // The delete chain resolves only after its final owner filter.
    mocks.checkpointQuery.eq.mockImplementation((column: string) =>
      column === "user_id" && mocks.checkpointQuery.delete.mock.calls.length
        ? Promise.resolve({ error: null })
        : mocks.checkpointQuery,
    );
    const response = await DELETE(request());
    expect(response.status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(mocks.checkpointQuery.delete).toHaveBeenCalledOnce();
    expect(mocks.remove.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.checkpointQuery.delete.mock.invocationCallOrder[0],
    );
  });
});
