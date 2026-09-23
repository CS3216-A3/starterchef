import { z } from "zod";

/**
 * Structured recipe steps extracted from a recipe source (video link, photo
 * of a recipe card, pasted text) or generated from a suggestion.
 */
export const cookingStepSchema = z.object({
  index: z.number().int().min(1),
  title: z
    .string()
    .describe("Short imperative title, e.g. 'Soften the tomatoes'"),
  instruction: z
    .string()
    .describe("1–2 sentences, beginner-friendly, no jargon"),
  durationSeconds: z
    .number()
    .int()
    .positive()
    // OpenAI Structured Outputs requires every object property to be present.
    // Keep the application shape optional after parsing, while requiring the
    // model to explicitly return null when a step has no natural timer.
    .nullable()
    .transform((value) => value ?? undefined)
    .describe("Set when the step has a natural timer"),
  ingredientsUsed: z.array(z.string()),
  tip: z
    .string()
    .nullable()
    .transform((value) => value ?? undefined),
  photoCheckpoint: z
    .string()
    .nullable()
    .transform((value) => value ?? undefined)
    .describe(
      "What a correct result looks like, for the optional photo-checkpoint feature",
    ),
});

export const recipeStepsSchema = z.object({
  steps: z.array(cookingStepSchema).min(1),
});

/**
 * Feedback on a photo the user takes mid-step ("camera checkpoint").
 * `looksRight` is null when the photo doesn't show the food clearly enough
 * to judge.
 */
export const stepCheckSchema = z.object({
  looksRight: z
    .boolean()
    .nullable()
    .describe(
      "true if the photo looks like a correct result, false if something is clearly off, null if the photo is unclear",
    ),
  feedback: z
    .string()
    .describe(
      "1–3 short sentences of practical feedback on what the photo shows vs what the step expects",
    ),
  tip: z
    .string()
    .nullable()
    .transform((value) => value ?? undefined)
    .describe("One concrete fix or next action, if anything needs adjusting"),
});

export type StepCheck = z.infer<typeof stepCheckSchema>;

/**
 * Post-cook recap generated from the session event timeline. Stored on
 * `cooking_sessions.summary` and shown on the recipe's cooking history.
 */
export const sessionRecapSchema = z.object({
  summary: z
    .string()
    .describe(
      "2–3 sentence friendly recap of how the cook went, for the user to re-read later",
    ),
  insights: z
    .array(z.string())
    .describe(
      "Short durable learnings about how this user cooks (struggles, fixes that worked, preferences) — phrased as facts, e.g. 'tends to undercook onions'",
    ),
  struggledSteps: z
    .array(z.number().int())
    .describe(
      "Step indexes where the user asked questions or a photo check needed a fix",
    ),
});

export type SessionRecap = z.infer<typeof sessionRecapSchema>;

export type CookingStep = z.infer<typeof cookingStepSchema>;
export type RecipeSteps = z.infer<typeof recipeStepsSchema>;
