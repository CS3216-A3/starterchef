import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "@/lib/rate-limit";

type RateLimitClient = Exclude<
  NonNullable<Parameters<typeof checkRateLimit>[1]>,
  number
>;

const USER_ID = "00000000-0000-0000-0000-000000000001";

function createMockClient(
  result: { data?: unknown; error?: { message: string } | null } = {
    data: [{ allowed: true, total: 1 }],
    error: null,
  },
): RateLimitClient {
  return {
    rpc: vi.fn().mockResolvedValue(result),
  } as unknown as RateLimitClient;
}

describe("checkRateLimit", () => {
  const originalLimit = process.env.AI_DAILY_LIMIT;

  afterEach(() => {
    process.env.AI_DAILY_LIMIT = originalLimit;
  });

  it("allows the first request and reports remaining = limit - 1", async () => {
    const client = createMockClient({
      data: [{ allowed: true, total: 1 }],
      error: null,
    });
    const result = await checkRateLimit(USER_ID, client);

    expect(result.allowed).toBe(true);
    expect(result.count).toBe(1);
    expect(result.limit).toBe(50);
    expect(result.remaining).toBe(49);
    expect(result.retryAfter).toBeGreaterThan(0);
    expect(result.retryAfter).toBeLessThanOrEqual(86_400);
    expect(client.rpc).toHaveBeenCalledWith("consume_ai_usage", {
      p_user_id: USER_ID,
      p_units: 1,
      p_limit: 50,
    });
  });

  it("allows a request exactly at the limit", async () => {
    const client = createMockClient({
      data: [{ allowed: true, total: 50 }],
      error: null,
    });
    const result = await checkRateLimit(USER_ID, client);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("blocks a request that exceeds the limit", async () => {
    const client = createMockClient({
      data: [{ allowed: false, total: 50 }],
      error: null,
    });
    const result = await checkRateLimit(USER_ID, client);

    expect(result.allowed).toBe(false);
    expect(result.count).toBe(50);
    expect(result.remaining).toBe(0);
  });

  it("respects a custom AI_DAILY_LIMIT", async () => {
    process.env.AI_DAILY_LIMIT = "10";
    const client = createMockClient({
      data: [{ allowed: true, total: 10 }],
      error: null,
    });
    const result = await checkRateLimit(USER_ID, 2, client);

    expect(result.limit).toBe(10);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("falls back to the default when AI_DAILY_LIMIT is invalid", async () => {
    process.env.AI_DAILY_LIMIT = "not-a-number";
    const client = createMockClient({
      data: [{ allowed: true, total: 1 }],
      error: null,
    });
    const result = await checkRateLimit(USER_ID, client);

    expect(result.limit).toBe(50);
  });

  it("falls back to the default when AI_DAILY_LIMIT is less than 1", async () => {
    process.env.AI_DAILY_LIMIT = "0";
    const client = createMockClient({
      data: [{ allowed: true, total: 1 }],
      error: null,
    });
    const result = await checkRateLimit(USER_ID, client);

    expect(result.limit).toBe(50);
  });

  it("throws when the Supabase RPC returns an error", async () => {
    const client = createMockClient({
      data: undefined,
      error: { message: "db down" },
    });

    await expect(checkRateLimit(USER_ID, client)).rejects.toThrow(
      "Rate limit check failed: db down",
    );
  });
});
