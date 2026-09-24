import type { User } from "@supabase/supabase-js";
import type { z } from "zod";
import { safeAiFailureCode } from "@/lib/ai/instrument";
import { protectedError, withProtectedRoute } from "@/lib/protected-route";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const AI_OPERATION_COSTS = {
  "kitchen-voice": 1,
  assistant: 1,
  "realtime-session": 1,
  suggestions: 2,
  edit: 2,
  adapt: 2,
  "step-check": 2,
  scan: 3,
  import: 3,
} as const;

interface RouteContext<TInput, TTrusted> {
  input: TInput;
  trusted: TTrusted;
  user: User;
  supabase: Supabase;
  request: Request;
  requestId: string;
}

interface AiRouteOptions<TSchema extends z.ZodType, TTrusted = undefined> {
  schema: TSchema;
  cost: number;
  loadContext?: (context: {
    input: z.infer<TSchema>;
    user: User;
    supabase: Supabase;
  }) => Promise<TTrusted>;
  shouldCharge?: (trusted: TTrusted) => boolean;
  handler: (
    context: RouteContext<z.infer<TSchema>, TTrusted>,
  ) => Promise<Response>;
}

/** Enforces the route lifecycle: auth -> parse -> trusted context -> quota -> AI. */
export function withAiRoute<TSchema extends z.ZodType, TTrusted = undefined>(
  options: AiRouteOptions<TSchema, TTrusted>,
) {
  return withProtectedRoute(async ({ request, requestId, user, supabase }) => {
    try {
      const parsed = options.schema.safeParse(
        await request.json().catch(() => null),
      );
      if (!parsed.success) {
        return protectedError(
          { requestId },
          400,
          "INVALID_REQUEST",
          "Invalid request",
        );
      }

      const trusted = options.loadContext
        ? await options.loadContext({ input: parsed.data, user, supabase })
        : (undefined as TTrusted);
      if (options.shouldCharge?.(trusted) ?? true) {
        const quota = await checkRateLimit(user.id, options.cost);
        if (!quota.allowed) return createRateLimitResponse(quota);
      }

      return await options.handler({
        input: parsed.data,
        trusted,
        user,
        supabase,
        request,
        requestId,
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          route: new URL(request.url).pathname,
          requestId,
          code: "INTERNAL_ERROR",
          failureCode: safeAiFailureCode(error),
        }),
      );
      return protectedError(
        { requestId },
        502,
        "INTERNAL_ERROR",
        "The assistant is unavailable. Please try again.",
      );
    }
  });
}
