import { z } from "zod";
import { scrapeRecipe } from "recipe-scrapers";
import {
  measuredGenerate,
  type MeasuredGenerateArgs,
} from "@/lib/ai/instrument";
import { getModel } from "@/lib/ai/model";
import { renderPrompt } from "@/lib/ai/prompts";
import { AI_OPERATION_COSTS, withAiRoute } from "@/lib/ai/route";
import { importedRecipeSchema } from "@/lib/ai/schemas/import";
import { protectedError } from "@/lib/protected-route";
import { isAllowedRecipeUrl } from "@/lib/recipe-source-allowlist";

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
  z
    .object({
      source: z.literal("video"),
      url: z
        .string()
        .url()
        .refine(isYouTubeUrl, "Only YouTube links are supported")
        .optional(),
      video: z.string().min(1).max(30_000_000).optional(),
    })
    .refine((v) => Boolean(v.url) !== Boolean(v.video), {
      message: "Provide either a YouTube link or a video file, not both",
    }),
]);

function isYouTubeUrl(raw: string): boolean {
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "");
    return (
      host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com"
    );
  } catch {
    return false;
  }
}

/**
 * POST /api/ai/import-recipe
 * Converts a pasted recipe, recipe URL, photo of a recipe card, or a YouTube
 * cooking video into a structured ImportedRecipe object. The caller is
 * responsible for saving it to the user's recipe library. Video import:
 * YouTube links go to Gemini as a file URI (it fetches the video itself);
 * TikTok/Instagram can't be fetched by link, so users upload a saved video
 * file which we pass inline to the model.
 */
/** Video analysis can take a while — give the route room (platforms clamp
 *  this to their own limit). */
export const maxDuration = 120;

export const POST = withAiRoute({
  schema: requestSchema,
  cost: AI_OPERATION_COSTS.import,
  async handler({ input, requestId }) {
    // Durable imports are created through /api/recipe-drafts. Keeping this
    // legacy endpoint from accepting a data URL prevents private photos from
    // being embedded in JSON requests or logs.
    if (input.source === "photo") {
      return protectedError(
        { requestId },
        410,
        "INVALID_REQUEST",
        "Upload the image to a recipe draft instead",
      );
    }
    if (
      (input.source === "url" && !isAllowedRecipeUrl(input.url)) ||
      input.source === "video"
    ) {
      return protectedError(
        { requestId },
        403,
        "SOURCE_NOT_ALLOWED",
        "This recipe source is not approved yet",
      );
    }
    const generateArgs = await buildGenerateArgs(input);
    if (!generateArgs.ok) {
      return protectedError(
        { requestId },
        generateArgs.status,
        "INVALID_REQUEST",
        generateArgs.error,
      );
    }

    const result = await measuredGenerate("import-recipe", generateArgs.args);

    // Attach the scraped source image (URL imports only) so the client can
    // store it as the recipe's hero photo.
    return Response.json({
      ...(result.object as Record<string, unknown>),
      imageUrl: generateArgs.imageUrl,
    });
  },
});
type GenerateArgsResult =
  | { ok: true; args: MeasuredGenerateArgs; imageUrl?: string }
  | { ok: false; error: string; status: number };

type ExtractionResult =
  | { ok: true; prompt: string; imageUrl?: string }
  | { ok: false; error: string; status: number };

async function buildGenerateArgs(
  input: z.infer<typeof requestSchema>,
): Promise<GenerateArgsResult> {
  const baseArgs = {
    model: getModel("import"),
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
      if (input.url) {
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
                    text: "Extract the recipe from this YouTube cooking video. Use the video's spoken and on-screen instructions; include timestamps where useful.",
                  },
                  {
                    type: "file" as const,
                    data: new URL(input.url),
                    mediaType: "video/mp4",
                  },
                ],
              },
            ],
          },
          imageUrl: youTubeThumbnail(input.url),
        };
      }

      // Uploaded file (e.g. a saved TikTok/Instagram clip) — sent inline.
      const video = parseDataUrl(input.video ?? "");
      if (!video || !video.mimeType.startsWith("video/")) {
        return {
          ok: false,
          error:
            "That file doesn't look like a video. Upload a saved TikTok/Instagram clip or paste a YouTube link.",
          status: 400,
        };
      }
      if (video.data.byteLength > 20 * 1024 * 1024) {
        return {
          ok: false,
          error:
            "That video is too large — keep it under 20 MB (trim the clip or paste a YouTube link instead).",
          status: 413,
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
                  text: "Extract the recipe from this cooking video. Use the video's spoken and on-screen instructions; include timestamps where useful.",
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

/** Thumbnail URL for a YouTube video — used as the recipe hero image. */
function youTubeThumbnail(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    const id =
      url.hostname.replace(/^www\./, "") === "youtu.be"
        ? url.pathname.slice(1)
        : url.searchParams.get("v");
    return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined;
  } catch {
    return undefined;
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
