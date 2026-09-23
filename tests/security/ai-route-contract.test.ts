import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  createRateLimitResponse: vi.fn(() =>
    Response.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Daily AI credit limit reached",
        },
      },
      { status: 429 },
    ),
  ),
}));

import { withAiRoute } from "@/lib/ai/route";

const provider = vi.fn(async () => Response.json({ ok: true }));
const route = withAiRoute({
  schema: z.object({ prompt: z.string().min(1) }),
  cost: 3,
  handler: provider,
});

function request(body: string) {
  return new Request("http://localhost/api/ai/test", { method: "POST", body });
}

describe("authenticated AI route contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-a" } } });
    mocks.checkRateLimit.mockResolvedValue({ allowed: true });
  });

  it("rejects unauthenticated requests before parsing, quota, or provider work", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const response = await route(request("not-json"));
    expect(response.status).toBe(401);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it("rejects malformed input without consuming quota", async () => {
    const response = await route(request(JSON.stringify({ prompt: "" })));
    expect(response.status).toBe(400);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it("consumes the fixed cost before invoking the provider", async () => {
    const response = await route(request(JSON.stringify({ prompt: "hello" })));
    expect(response.status).toBe(200);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("user-a", 3);
    expect(provider).toHaveBeenCalledOnce();
  });

  it("returns 429 and never invokes the provider when quota is exhausted", async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false });
    const response = await route(request(JSON.stringify({ prompt: "hello" })));
    expect(response.status).toBe(429);
    expect(provider).not.toHaveBeenCalled();
  });
});
