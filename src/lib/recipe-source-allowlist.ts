import "server-only";

/** Temporary debugging policy: accept every web URL. Keep non-web schemes
 * out so this endpoint cannot fetch local files or browser-only protocols. */
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
