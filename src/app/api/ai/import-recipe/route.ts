import { NextResponse } from "next/server";
import { z } from "zod";
import { scrapeRecipe } from "recipe-scrapers";
import { measuredGenerate } from "@/lib/ai/instrument";
import { getModel } from "@/lib/ai/model";
import { renderPrompt } from "@/lib/ai/prompts";
import { importedRecipeSchema } from "@/lib/ai/schemas/import";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("text"),
    content: z.string().min(1).max(20000),
  }),
  z.object({
    source: z.literal("url"),
    url: z.string().url(),
    html: z.string().max(200000).optional(),
  }),
  z.object({
    source: z.literal("photo"),
    image: z.string().min(1).max(5_000_000),
  }),
  z.object({
    source: z.literal("video"),
    url: z.string().url(),
  }),
]);

/**
 * POST /api/ai/import-recipe
 * Converts a pasted recipe, recipe URL, photo of a recipe card, or cooking
 * video into a structured ImportedRecipe object. The caller is responsible for
 * saving it to the user's recipe library.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = await checkRateLimit(user.id);
    if (!rateLimit.allowed) {
      return createRateLimitResponse(rateLimit);
    }

    const body = (await request.json()) as unknown;
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const input = parsed.data;

    if (input.source === "video") {
      return NextResponse.json(
        { error: "Video import is not yet implemented" },
        { status: 501 },
      );
    }

    const extraction = await extractSourceText(input);
    if (!extraction.ok) {
      return NextResponse.json(
        { error: extraction.error },
        { status: extraction.status },
      );
    }

    const generateArgs =
      input.source === "photo"
        ? {
            model: getModel(),
            schema: importedRecipeSchema,
            temperature: 0.4,
            system: renderPrompt("import-recipe", {}),
            messages: [
              {
                role: "user" as const,
                content: [
                  { type: "text" as const, text: extraction.prompt },
                  { type: "image" as const, image: input.image },
                ],
              },
            ],
          }
        : {
            model: getModel(),
            schema: importedRecipeSchema,
            temperature: 0.4,
            system: renderPrompt("import-recipe", {}),
            prompt: extraction.prompt,
          };

    const result = await measuredGenerate("import-recipe", generateArgs);

    return NextResponse.json(result.object);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Recipe import failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

type ExtractionResult =
  { ok: true; prompt: string } | { ok: false; error: string; status: number };

async function extractSourceText(
  input: z.infer<typeof requestSchema>,
): Promise<ExtractionResult> {
  switch (input.source) {
    case "text":
      return { ok: true, prompt: input.content };

    case "url": {
      const { url, html } = input;

      let pageHtml: string;
      if (html) {
        pageHtml = html;
      } else {
        try {
          const response = await fetch(url, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (compatible; StarterChef/1.0; +https://starterchef.dev)",
            },
          });
          if (!response.ok) {
            return {
              ok: false,
              error: `Could not fetch the page (${response.status}). Try pasting the page HTML instead.`,
              status: 502,
            };
          }
          pageHtml = await response.text();
        } catch {
          return {
            ok: false,
            error:
              "Failed to fetch the URL. Try pasting the page HTML instead.",
            status: 502,
          };
        }
      }

      try {
        const scraped = await scrapeRecipe(pageHtml, url, { safeParse: true });
        if (!scraped.success) {
          return {
            ok: false,
            error: "Could not find a recipe schema on that page.",
            status: 422,
          };
        }
        const recipe = scraped.data as unknown as {
          name?: string;
          description?: string;
          recipeIngredient?: string[];
          recipeInstructions?: (string | { text?: string })[];
          prepTime?: string;
          cookTime?: string;
          totalTime?: string;
          recipeYield?: string;
          image?: string;
        };
        return {
          ok: true,
          prompt: buildPromptFromScraped(url, recipe),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          error: `Could not parse recipe from page: ${message}`,
          status: 422,
        };
      }
    }

    case "photo": {
      return {
        ok: true,
        prompt:
          "Extract the recipe from this photo of a recipe card, page, or screenshot.",
      };
    }

    case "video":
      return { ok: false, error: "Not implemented", status: 501 };
  }
}

function buildPromptFromScraped(
  url: string,
  recipe: {
    name?: string;
    description?: string;
    recipeIngredient?: string[];
    recipeInstructions?: (string | { text?: string })[];
    prepTime?: string;
    cookTime?: string;
    totalTime?: string;
    recipeYield?: string;
    image?: string;
  },
): string {
  const instructions = (recipe.recipeInstructions ?? [])
    .map((step, i) => {
      const text = typeof step === "string" ? step : (step.text ?? "");
      return `${i + 1}. ${text}`;
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
    ...(recipe.recipeIngredient ?? []).map((ing) => `- ${ing}`),
    "",
    "Instructions:",
    instructions,
  ].join("\n");
}
