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

/** undici reports network failures as TypeError("fetch failed") with the real
 * reason on .cause (ECONNRESET, TLS errors, DNS failures, the SSRF guard).
 * Walk the chain, keeping each level's `code` when present, so logs show the
 * root failure instead of the generic wrapper message. */
export function workflowErrorChain(
  error: unknown,
  fallback = "Workflow failed",
): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current != null; depth += 1) {
    const message = workflowErrorMessage(current, "");
    const code = (current as { code?: unknown } | null)?.code;
    const part = [typeof code === "string" ? code : "", message]
      .filter(Boolean)
      .join(" ");
    if (part) parts.push(part);
    current = (current as { cause?: unknown } | null)?.cause;
  }
  return parts.length ? parts.join(" <- ") : fallback;
}
