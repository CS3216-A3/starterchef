/** Public tool shape; only the server binds it to trusted session context.
 * Calling this function is observational and never mutates cooking state. */
export const VOICE_PROPOSAL_DESCRIPTION =
  "Suggest a cooking change to show for user confirmation. This tool never changes the session.";

export const VOICE_PROPOSAL_PARAMETERS = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["adjust-step", "set-timer", "goto-step"] },
    detail: {
      type: "string",
      description: "Exact proposed change and why; required for an adjustment.",
    },
    replacementInstruction: {
      type: "string",
      description:
        "Full replacement text for the current cooking step after the change. Required for adjust-step.",
    },
    timerSeconds: {
      type: "integer",
      description: "Timer duration in seconds for set-timer.",
    },
    stepIndex: {
      type: "integer",
      description: "One-based target step for goto-step.",
    },
  },
  required: ["type"],
} as const;
