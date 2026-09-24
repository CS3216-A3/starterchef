/** Read the safe, stable message from the standard API error envelope. */
export async function getApiErrorMessage(
  response: Response,
  fallback = "Something went wrong. Please try again.",
) {
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: unknown; details?: { formErrors?: unknown } };
  } | null;
  const message = body?.error?.message;
  if (typeof message === "string" && message.trim()) return message;
  const formError = body?.error?.details?.formErrors;
  if (Array.isArray(formError) && typeof formError[0] === "string")
    return formError[0];
  return fallback;
}
