import { z } from "zod";

/**
 * Response from the in-cooking voice assistant. `answer` is spoken back to the
 * user; `action` describes a structured intent the UI can offer to apply
 * (always suggest-accept, never automatic).
 */
export const assistantReplySchema = z.object({
  answer: z
    .string()
    .describe("1–3 short sentences, plain text, suitable for text-to-speech"),
  action: z
    .object({
      type: z.enum([
        "none",
        "substitute-ingredient",
        "adjust-step",
        "set-timer",
        "repeat-step",
        "needs-human",
      ]),
      detail: z.string().optional(),
      timerSeconds: z.number().int().positive().optional(),
    })
    .optional(),
});

export type AssistantReply = z.infer<typeof assistantReplySchema>;
