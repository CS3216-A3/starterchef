import { z } from "zod";

export const voiceActionSchema = z
  .object({
    type: z.enum(["adjust-step", "set-timer", "goto-step"]),
    detail: z.string().trim().min(1).max(1000).optional(),
    timerSeconds: z.number().int().min(1).max(86400).optional(),
    stepIndex: z.number().int().min(1).max(100).optional(),
  })
  .strict()
  .refine((action) =>
    action.type === "adjust-step"
      ? Boolean(action.detail)
      : action.type === "set-timer"
        ? Boolean(action.timerSeconds)
        : Boolean(action.stepIndex),
  );

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
        "goto-step",
        "repeat-step",
        "needs-human",
      ]),
      detail: z.string().optional(),
      timerSeconds: z.number().int().positive().optional(),
      stepIndex: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("For goto-step: the 1-based step to navigate to"),
    })
    .optional(),
});

export type AssistantReply = z.infer<typeof assistantReplySchema>;
