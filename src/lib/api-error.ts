import { NextResponse } from "next/server";

export type ApiErrorCode =
  "UNAUTHORIZED" | "INVALID_REQUEST" | "RATE_LIMITED" | "INTERNAL_ERROR";

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown,
) {
  return NextResponse.json(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status },
  );
}
