import "server-only";

/** Public HTTP(S) sources are intentionally permissive in Phase 3. Network
 * safety is enforced again immediately before every server fetch. */
export const RECIPE_SOURCE_ALLOWLIST_VERSION = 2;

export function isAllowedRecipeUrl(raw: string) {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isAllowedYouTubeUrl(raw: string) {
  try {
    const url = new URL(raw);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      ["youtube.com", "youtu.be", "m.youtube.com"].includes(
        url.hostname.replace(/^www\./, ""),
      )
    );
  } catch {
    return false;
  }
}
