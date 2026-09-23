import "server-only";
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

export function getDailyAiLimit(): number {
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
  unitsOrClient: number | ReturnType<typeof createAdminClient> = 1,
  clientOverride?: ReturnType<typeof createAdminClient>,
): Promise<RateLimitResult> {
  const units = typeof unitsOrClient === "number" ? unitsOrClient : 1;
  const client =
    typeof unitsOrClient === "number"
      ? (clientOverride ?? createAdminClient())
      : unitsOrClient;
  const limit = getDailyAiLimit();

  if (!Number.isInteger(units) || units < 1 || units > 100) {
    throw new Error("Invalid AI quota cost");
  }

  const { data, error } = await client.rpc("consume_ai_usage", {
    p_user_id: userId,
    p_units: units,
    p_limit: limit,
  });

  if (error) {
    throw new Error(`Rate limit check failed: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  const count = typeof row?.total === "number" ? row.total : 0;
  const allowed = row?.allowed === true;
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
      error: {
        code: "RATE_LIMITED",
        message: "Daily AI credit limit reached",
        details: {
          limit: result.limit,
          remaining: result.remaining,
          retryAfter: result.retryAfter,
          resetAt: result.resetAt,
        },
      },
    },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfter) },
    },
  );
}
