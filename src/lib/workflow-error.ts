/**
 * Read an error's message without `instanceof Error`. Workflow bodies run in
 * a `node:vm` sandbox, while step failures are rethrown as host-realm
 * `FatalError`s, so `instanceof` against the sandbox's `Error` is false and
 * the real message (which failure codes are derived from) would be lost.
 */
export function workflowErrorMessage(
  error: unknown,
  fallback = "Workflow failed",
): string {
  if (typeof error === "string") return error;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && message ? message : fallback;
}
