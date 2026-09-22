/**
 * Map raw provider errors to short, friendly messages. Provider errors like
 * "AI_APICallError: This model is currently experiencing high demand…" mean
 * nothing to a cook mid-recipe — give them something actionable instead.
 */
export function friendlyAiError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message.toLowerCase() : "";

  if (
    msg.includes("high demand") ||
    msg.includes("overloaded") ||
    msg.includes("resource_exhausted") ||
    msg.includes("resource exhausted") ||
    msg.includes("capacity") ||
    msg.includes("503") ||
    msg.includes("unavailable")
  ) {
    return "StarterChef is a bit busy right now — try again in a moment.";
  }
  if (
    msg.includes("rate limit") ||
    msg.includes("quota") ||
    msg.includes("429") ||
    msg.includes("too many requests")
  ) {
    return "You're cooking faster than we can keep up — try again shortly.";
  }
  if (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("deadline")
  ) {
    return "That took too long — give it another try.";
  }
  if (
    msg.includes("api key") ||
    msg.includes("apikey") ||
    msg.includes("unauthorized") ||
    msg.includes("401")
  ) {
    return "Our AI service isn't configured right — we've been notified.";
  }
  return fallback;
}
