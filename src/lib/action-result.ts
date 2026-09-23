export type ActionResult<T extends object = Record<string, never>> =
  ({ ok: true } & T) | { ok?: false; error: string };

export function safeActionFailure(operation: string, error?: unknown) {
  console.error(
    `Server action failed: ${operation}`,
    error instanceof Error ? { name: error.name } : {},
  );
  return { error: `Could not ${operation}. Please try again.` } as const;
}

export function getUiError(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return fallback;
}
