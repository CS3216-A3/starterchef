import "server-only";
import { scrapeRecipe } from "recipe-scrapers";

const MAX_SOURCE_BYTES = 1_000_000;

/** Fetch and reduce a public recipe page to the structured data needed by the
 * workflow. Call this only from a durable workflow step, never from a client.
 */
export async function loadRecipeWebSource(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; StarterChef/1.0; +https://starterchef.dev)",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(`Could not fetch recipe page (${response.status})`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_SOURCE_BYTES)
    throw new Error("Recipe page is too large to import");
  const html = await response.text();
  if (html.length > MAX_SOURCE_BYTES)
    throw new Error("Recipe page is too large to import");

  const scraped = await scrapeRecipe(html, url, { safeParse: true });
  if (!scraped.success)
    throw new Error("Could not find a recipe schema on that page");
  const recipe = scraped.data as unknown as RecipePageData;
  return buildPromptFromScraped(url, recipe);
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
