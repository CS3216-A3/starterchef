/**
 * Simple slug generator. Removes non-alphanumeric characters, collapses
 * whitespace to dashes, and lowercases the result. Not guaranteed unique —
 * callers should append a suffix if needed.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}
