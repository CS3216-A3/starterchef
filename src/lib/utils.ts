import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** API errors arrive as `{error: {code, message}}` (apiError) or plain
 *  `{error: "..."}` — always extract a display string. */
export function apiErrorMessage(body: unknown, fallback: string): string {
  const err = (body as { error?: unknown } | null)?.error;
  if (typeof err === "string" && err) return err;
  const msg = (err as { message?: unknown } | null)?.message;
  if (typeof msg === "string" && msg) return msg;
  return fallback;
}
