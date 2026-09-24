import { randomUUID } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { apiError, type ApiErrorCode } from "@/lib/api-error";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface ProtectedRouteContext {
  request: Request;
  requestId: string;
  user: User;
  supabase: Supabase;
}

function isMutation(request: Request) {
  return !["GET", "HEAD", "OPTIONS"].includes(request.method);
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // Browser form submissions can omit Origin. Cookie-authenticated fetch/XHR
  // mutations must supply it, so reject an absent or mismatched value.
  return origin === new URL(request.url).origin;
}

function protectedHeaders(response: Response, requestId: string) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Request-ID", requestId);
  return new Response(response.body, { status: response.status, headers });
}

/** Shared boundary for every cookie-authenticated API handler. */
export function withProtectedRoute(
  handler: (context: ProtectedRouteContext) => Promise<Response>,
) {
  return async function protectedHandler(request: Request): Promise<Response> {
    const requestId = randomUUID();
    let response: Response;
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        response = apiError(
          401,
          "UNAUTHORIZED",
          "Authentication required",
          undefined,
          requestId,
        );
      } else if (isMutation(request) && !isSameOrigin(request)) {
        response = apiError(
          403,
          "ORIGIN_NOT_ALLOWED",
          "This request must come from StarterChef.",
          undefined,
          requestId,
        );
      } else {
        response = await handler({ request, requestId, user, supabase });
      }
    } catch {
      const code: ApiErrorCode = "INTERNAL_ERROR";
      console.error(
        JSON.stringify({
          route: new URL(request.url).pathname,
          requestId,
          code,
        }),
      );
      response = apiError(
        500,
        code,
        "Something went wrong. Please try again.",
        undefined,
        requestId,
      );
    }
    return protectedHeaders(response, requestId);
  };
}

export function protectedError(
  context: Pick<ProtectedRouteContext, "requestId">,
  status: number,
  code: ApiErrorCode,
  message: string,
) {
  return apiError(status, code, message, undefined, context.requestId);
}
