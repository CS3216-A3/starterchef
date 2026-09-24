import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { scrapeRecipe } from "recipe-scrapers";
import { Agent } from "undici";

const MAX_SOURCE_BYTES = 1_000_000;

/** Fetch and reduce a public recipe page to the structured data needed by the
 * workflow. Call this only from a durable workflow step, never from a client.
 */
export async function loadRecipeWebSource(url: string): Promise<string> {
  let current = await assertPublicRecipeUrl(url);
  let response: Response | undefined;
  const signal = AbortSignal.timeout(15_000);
  // Validate at the *actual connection lookup* too. A hostname that changes
  // from public to private between preflight and connect must not be fetched.
  const dispatcher = new Agent({
    connect: {
      lookup(hostname, _options, callback) {
        void lookup(hostname, { all: true, verbatim: true })
          .then((addresses) => {
            if (
              !addresses.length ||
              addresses.some(({ address }) => isReservedAddress(address))
            ) {
              callback(
                new Error("Recipe source must resolve to a public address"),
                "",
                0,
              );
              return;
            }
            const selected = addresses[0];
            callback(null, selected.address, selected.family);
          })
          .catch(() =>
            callback(
              new Error("Recipe source host could not be resolved"),
              "",
              0,
            ),
          );
      },
    },
  });
  // Do not let fetch follow a redirect without inspecting its destination.
  try {
    for (let redirects = 0; redirects <= 5; redirects += 1) {
      response = await fetch(current, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; StarterChef/1.0; +https://starterchef.dev)",
        },
        redirect: "manual",
        signal,
        dispatcher,
      } as RequestInit & { dispatcher: Agent });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new Error("Recipe page redirect has no destination");
      current = await assertPublicRecipeUrl(
        new URL(location, current).toString(),
      );
    }
    if (!response || [301, 302, 303, 307, 308].includes(response.status))
      throw new Error("Recipe page redirected too many times");
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Could not fetch recipe page (${response.status})`);
    }
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_SOURCE_BYTES) {
      await response.body?.cancel();
      throw new Error("Recipe page is too large to import");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Recipe page has no body");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_SOURCE_BYTES)
          throw new Error("Recipe page is too large to import");
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const html = new TextDecoder().decode(bytes);

    const scraped = await scrapeRecipe(html, current, { safeParse: true });
    if (!scraped.success)
      throw new Error("Could not find a recipe schema on that page");
    const recipe = scraped.data as unknown as RecipePageData;
    return buildPromptFromScraped(current, recipe);
  } finally {
    await dispatcher.close();
  }
}

/** Reject literal and DNS-resolved destinations that can reach the host or a
 * private network. Call this for the initial URL and every redirect target. */
export async function assertPublicRecipeUrl(raw: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Recipe source URL is invalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("Recipe source must use HTTP or HTTPS");
  if (url.username || url.password || !url.hostname)
    throw new Error("Recipe source host is invalid");
  const host = url.hostname.replace(/[\[\]]/g, "").toLowerCase();
  if (isReservedAddress(host))
    throw new Error("Recipe source must be publicly reachable");
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error("Recipe source host could not be resolved");
  }
  if (
    !addresses.length ||
    addresses.some(({ address }) => isReservedAddress(address))
  )
    throw new Error("Recipe source must resolve to a public address");
  return url.toString();
}

export function isReservedAddress(value: string): boolean {
  const host = value
    .toLowerCase()
    .replace(/[\[\]]/g, "")
    .replace(/\.$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".home.arpa")
  )
    return true;
  if (isIP(host) === 6) {
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
    if (mapped) {
      const high = parseInt(mapped[1], 16);
      const low = parseInt(mapped[2], 16);
      return isReservedAddress(
        `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`,
      );
    }
    if (host.startsWith("::ffff:")) return isReservedAddress(host.slice(7));
    const first = host.startsWith("::") ? 0 : parseInt(host.split(":")[0], 16);
    return (
      host === "::" ||
      host === "::1" ||
      (first & 0xfe00) === 0xfc00 ||
      (first & 0xffc0) === 0xfe80 ||
      (first & 0xff00) === 0xff00 ||
      host.startsWith("2001:db8:")
    );
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split(".").map(Number);
    if (parts.some((part) => part > 255)) return true;
    const [a, b, c] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 &&
        ((b === 0 && c === 0) ||
          (b === 0 && c === 2) ||
          (b === 88 && c === 99) ||
          b === 168)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  return false;
}

type RecipePageData = {
  name?: string;
  description?: string;
  recipeIngredient?: string[];
  recipeInstructions?: (string | { text?: string })[];
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  recipeYield?: string;
};

function buildPromptFromScraped(url: string, recipe: RecipePageData): string {
  const instructions = (recipe.recipeInstructions ?? [])
    .map((step, index) => {
      const text = typeof step === "string" ? step : (step.text ?? "");
      return `${index + 1}. ${text}`;
    })
    .join("\n");
  return [
    `Recipe source: ${url}`,
    `Title: ${recipe.name ?? "Unknown"}`,
    `Description: ${recipe.description ?? ""}`,
    `Yield: ${recipe.recipeYield ?? ""}`,
    `Prep time: ${recipe.prepTime ?? ""}`,
    `Cook time: ${recipe.cookTime ?? ""}`,
    `Total time: ${recipe.totalTime ?? ""}`,
    "",
    "Ingredients:",
    ...(recipe.recipeIngredient ?? []).map((ingredient) => `- ${ingredient}`),
    "",
    "Instructions:",
    instructions,
  ].join("\n");
}
