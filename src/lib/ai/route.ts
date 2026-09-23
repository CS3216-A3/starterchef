import type { User } from "@supabase/supabase-js";
import type { z } from "zod";
import { apiError } from "@/lib/api-error";
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
}

interface AiRouteOptions<TSchema extends z.ZodType, TTrusted = undefined> {
  schema: TSchema;
  cost: number;
  loadContext?: (context: {
    input: z.infer<TSchema>;
    user: User;
    supabase: Supabase;
  }) => Promise<TTrusted>;
  handler: (
    context: RouteContext<z.infer<TSchema>, TTrusted>,
  ) => Promise<Response>;
}

/** Enforces the route lifecycle: auth -> parse -> trusted context -> quota -> AI. */
export function withAiRoute<TSchema extends z.ZodType, TTrusted = undefined>(
  options: AiRouteOptions<TSchema, TTrusted>,
) {
  return async function handle(request: Request): Promise<Response> {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user)
        return apiError(401, "UNAUTHORIZED", "Authentication required");

      const parsed = options.schema.safeParse(
        await request.json().catch(() => null),
      );
      if (!parsed.success) {
        return apiError(
          400,
          "INVALID_REQUEST",
          "Invalid request",
          parsed.error.flatten(),
        );
      }

      const trusted = options.loadContext
        ? await options.loadContext({ input: parsed.data, user, supabase })
        : (undefined as TTrusted);
      const quota = await checkRateLimit(user.id, options.cost);
      if (!quota.allowed) return createRateLimitResponse(quota);

      return await options.handler({
        input: parsed.data,
        trusted,
        user,
        supabase,
        request,
      });
    } catch (error) {
      console.error(
        "AI route failed",
        error instanceof Error ? { name: error.name } : {},
      );
      return apiError(
        502,
        "INTERNAL_ERROR",
        "The assistant is unavailable. Please try again.",
      );
    }
  };
}
