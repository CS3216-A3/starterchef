import "server-only";

/** Versioned approval boundary. Add a host/video only after external review. */
export const RECIPE_SOURCE_ALLOWLIST_VERSION = 1;
const approvedHttpsHosts = new Set<string>();
const approvedYouTubeIds = new Set<string>();

export function isAllowedRecipeUrl(raw: string) {
  try {
    const url = new URL(raw);
    return (
      url.protocol === "https:" &&
      approvedHttpsHosts.has(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

export function isAllowedYouTubeUrl(raw: string) {
  try {
    const url = new URL(raw);
    const id =
      url.hostname.replace(/^www\./, "") === "youtu.be"
        ? url.pathname.slice(1)
        : url.searchParams.get("v");
    return (
      url.protocol === "https:" && Boolean(id && approvedYouTubeIds.has(id))
    );
  } catch {
    return false;
  }
}
