import { NextResponse } from "next/server";
import { generateObject } from "ai";
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
    video: z.string().min(1).max(50_000_000),
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

    const generateArgs = await buildGenerateArgs(input);
    if (!generateArgs.ok) {
      return NextResponse.json(
        { error: generateArgs.error },
        { status: generateArgs.status },
      );
    }

    const result = await measuredGenerate("import-recipe", generateArgs.args);

    // Attach the scraped source image (URL imports only) so the client can
    // store it as the recipe's hero photo.
    return NextResponse.json({
      ...(result.object as Record<string, unknown>),
      imageUrl: generateArgs.imageUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Recipe import failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

type GenerateArgsResult =
  | { ok: true; args: Parameters<typeof generateObject>[0]; imageUrl?: string }
  | { ok: false; error: string; status: number };

type ExtractionResult =
  | { ok: true; prompt: string; imageUrl?: string }
  | { ok: false; error: string; status: number };

async function buildGenerateArgs(
  input: z.infer<typeof requestSchema>,
): Promise<GenerateArgsResult> {
  const baseArgs = {
    model: getModel(),
    schema: importedRecipeSchema,
    temperature: 0.4,
    system: renderPrompt("import-recipe", {}),
  };

  switch (input.source) {
    case "text": {
      return {
        ok: true,
        args: { ...baseArgs, prompt: input.content },
      };
    }

    case "url": {
      const extraction = await extractSourceText(input);
      if (!extraction.ok) return extraction;
      return {
        ok: true,
        args: { ...baseArgs, prompt: extraction.prompt },
        imageUrl: extraction.imageUrl,
      };
    }

    case "photo": {
      return {
        ok: true,
        args: {
          ...baseArgs,
          messages: [
            {
              role: "user" as const,
              content: [
                {
                  type: "text" as const,
                  text: "Extract the recipe from this photo of a recipe card, page, or screenshot.",
                },
                { type: "image" as const, image: input.image },
              ],
            },
          ],
        },
      };
    }

    case "video": {
      const video = parseDataUrl(input.video);
      if (!video) {
        return {
          ok: false,
          error:
            "Invalid video upload. Provide a base64 data URL (data:video/mp4;base64,...).",
          status: 400,
        };
      }
      return {
        ok: true,
        args: {
          ...baseArgs,
          messages: [
            {
              role: "user" as const,
              content: [
                {
                  type: "text" as const,
                  text: "Extract the recipe from this cooking video. Include timestamps where useful.",
                },
                {
                  type: "file" as const,
                  data: video.data,
                  mediaType: video.mimeType,
                },
              ],
            },
          ],
        },
      };
    }
  }
}

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
          image?: string | { url?: string }[];
        };
        const image = recipe.image;
        const imageUrl =
          typeof image === "string"
            ? image
            : Array.isArray(image)
              ? image[0]?.url
              : undefined;
        return {
          ok: true,
          prompt: buildPromptFromScraped(url, recipe),
          imageUrl,
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

function parseDataUrl(
  dataUrl: string,
): { data: Buffer; mimeType: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mimeType = match[1];
  try {
    const data = Buffer.from(match[2], "base64");
    return { data, mimeType };
  } catch {
    return null;
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
    image?: string | { url?: string }[];
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
