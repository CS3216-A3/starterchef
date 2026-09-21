import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  count: number;
  retryAfter: number;
  resetAt: string;
}

const DEFAULT_AI_DAILY_LIMIT = 50;

function getDailyLimit(): number {
  const raw = process.env.AI_DAILY_LIMIT;
  if (!raw) return DEFAULT_AI_DAILY_LIMIT;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed < 1 ? DEFAULT_AI_DAILY_LIMIT : parsed;
}

function getNextMidnightUTC(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
}

/**
 * Check and increment the per-user daily AI usage quota.
 *
 * Uses an atomic Postgres function (`increment_ai_usage`) so the read-increment-
 * write cycle is safe under concurrent serverless invocations. The current quota
 * resets at midnight UTC.
 */
export async function checkRateLimit(
  userId: string,
  client = createAdminClient(),
): Promise<RateLimitResult> {
  const limit = getDailyLimit();

  const { data, error } = await client.rpc("increment_ai_usage", {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Rate limit check failed: ${error.message}`);
  }

  const count = typeof data === "number" ? data : 1;
  const allowed = count <= limit;
  const remaining = Math.max(0, limit - count);
  const resetAt = getNextMidnightUTC();
  const retryAfter = Math.max(
    0,
    Math.ceil((resetAt.getTime() - Date.now()) / 1000),
  );

  return {
    allowed,
    limit,
    remaining,
    count,
    retryAfter,
    resetAt: resetAt.toISOString(),
  };
}

/**
 * Build a standard 429 response for an exceeded AI rate limit.
 */
export function createRateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    {
      error: "Daily AI request limit reached",
      limit: result.limit,
      remaining: result.remaining,
      retryAfter: result.retryAfter,
    },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfter) },
    },
  );
}
