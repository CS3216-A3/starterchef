import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  query: { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  })),
}));

import { GET } from "@/app/api/recipe-drafts/[id]/route";

const id = "de78a3ae-9826-48d8-a69d-cb70d2342300";

describe("recipe draft detail during migration rollout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } } });
    mocks.from.mockReturnValue(mocks.query);
    mocks.query.select.mockReturnValue(mocks.query);
    mocks.query.eq.mockReturnValue(mocks.query);
  });

  it("reads an existing blocked draft without selecting the 0030-only column", async () => {
    mocks.query.maybeSingle.mockResolvedValue({
      data: {
        id,
        status: "blocked",
        failure_code: "REVISION_LIMIT_REACHED",
        canonical_recipe: null,
        verification: { verification_final: { verdict: "revise" } },
        accepted_recipe_id: null,
        expires_at: "2026-10-01T00:00:00Z",
        restart_count: 0,
        updated_at: "2026-09-24T00:00:00Z",
      },
      error: null,
    });
    const response = await GET(
      new Request(`http://localhost/api/recipe-drafts/${id}`),
    );
    expect(response.status).toBe(200);
    expect(mocks.query.select).toHaveBeenCalledWith(
      expect.not.stringContaining("clarification_expires_at"),
    );
    expect(await response.json()).toMatchObject({
      draftId: id,
      status: "blocked",
      failureCode: "REVISION_LIMIT_REACHED",
      clarificationExpiresAt: null,
    });
  });

  it("returns the saved clarification deadline without a schema-specific read", async () => {
    mocks.query.maybeSingle.mockResolvedValue({
      data: {
        id,
        status: "awaiting_user_input",
        failure_code: null,
        canonical_recipe: null,
        verification: {
          clarificationExpiresAt: "2099-01-01T00:00:00Z",
          sourceAssessment: { clarificationQuestion: "What dish is this?" },
        },
        accepted_recipe_id: null,
        expires_at: "2099-01-02T00:00:00Z",
        restart_count: 0,
        updated_at: "2026-09-24T00:00:00Z",
      },
      error: null,
    });
    const response = await GET(
      new Request(`http://localhost/api/recipe-drafts/${id}`),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "awaiting_user_input",
      clarificationExpiresAt: "2099-01-01T00:00:00Z",
    });
  });
});
