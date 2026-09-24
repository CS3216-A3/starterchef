import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  query: {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  })),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("workflow/api", () => ({ start: vi.fn() }));
vi.mock("../workflows/recipe-verification", () => ({
  recipeVerificationWorkflow: vi.fn(),
}));

import { GET } from "@/app/api/recipe-drafts/route";
import { loadActiveRecipeDraft } from "@/lib/active-recipe-draft";

describe("active recipe review lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-a" } } });
    mocks.from.mockReturnValue(mocks.query);
    for (const name of ["select", "eq", "in", "order", "limit"] as const)
      mocks.query[name].mockReturnValue(mocks.query);
    mocks.query.maybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it("requires authentication before querying drafts", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const response = await GET(
      new Request("http://localhost/api/recipe-drafts"),
    );
    expect(response.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("returns only owner-scoped active draft metadata", async () => {
    mocks.query.maybeSingle.mockResolvedValue({
      data: {
        id: "draft-a",
        kind: "text",
        status: "awaiting_user_acceptance",
        updated_at: "2026-09-24T00:00:00Z",
        request: { content: "private recipe" },
      },
      error: null,
    });
    const response = await GET(
      new Request("http://localhost/api/recipe-drafts"),
    );
    expect(response.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith("recipe_drafts");
    expect(mocks.query.eq).toHaveBeenCalledWith("user_id", "user-a");
    expect(mocks.query.in).toHaveBeenCalledWith(
      "status",
      expect.arrayContaining(["queued", "awaiting_user_acceptance"]),
    );
    expect(await response.json()).toEqual({
      activeDraft: {
        draftId: "draft-a",
        kind: "text",
        status: "awaiting_user_acceptance",
        updatedAt: "2026-09-24T00:00:00Z",
      },
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns null when no review is active", async () => {
    const response = await GET(
      new Request("http://localhost/api/recipe-drafts"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ activeDraft: null });
  });

  it("does not treat a database failure as no active review", async () => {
    mocks.query.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "db unavailable" },
    });
    const response = await GET(
      new Request("http://localhost/api/recipe-drafts"),
    );
    expect(response.status).toBe(500);
  });
});

describe("active draft client lookup", () => {
  it("reads the active review for the resume UI", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ activeDraft: { draftId: "draft-a" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      expect(await loadActiveRecipeDraft()).toEqual({ draftId: "draft-a" });
      expect(fetchMock).toHaveBeenCalledWith("/api/recipe-drafts", {
        cache: "no-store",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
