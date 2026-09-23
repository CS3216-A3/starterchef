import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "INVALID_REQUEST"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "ORIGIN_NOT_ALLOWED"
  | "SOURCE_NOT_ALLOWED"
  | "NOT_FOUND"
  | "CONFLICT";

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown,
  requestId?: string,
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
        ...(requestId ? { requestId } : {}),
      },
    },
    { status },
  );
}
