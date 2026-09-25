import { z } from "zod";
import {
  activeCookingContext,
  cookingPrompt,
  loadCookingAssistantContext,
} from "@/lib/ai/cooking-context";
import { measuredGenerate } from "@/lib/ai/instrument";
import { getModel } from "@/lib/ai/model";
import { AI_OPERATION_COSTS, withAiRoute } from "@/lib/ai/route";
import { assistantReplySchema } from "@/lib/ai/schemas/assistant";
import { logSessionEvent } from "@/lib/session-events";

const requestSchema = z.object({
  question: z.string().min(1).max(1000),
  sessionId: z.uuid(),
  channel: z.enum(["text", "voice"]).optional(),
});

/**
 * POST /api/ai/assistant
 * In-cooking Q&A. `context` grounds the answer in the user's current recipe
 * step, and `getCookingMemory` adds what past sessions taught us about how
 * this person cooks. The reply's optional `action` is a suggestion — the UI
 * offers it, the user confirms.
 */
export const POST = withAiRoute({
  schema: requestSchema,
  cost: AI_OPERATION_COSTS.assistant,
  loadContext: ({ input, supabase, user }) =>
    loadCookingAssistantContext(supabase, user.id, input.sessionId),
  shouldCharge: (trusted) => activeCookingContext(trusted) !== null,
  async handler({ input, trusted, supabase, user }) {
    const { question, sessionId, channel } = input;
    if (!trusted.session || trusted.session.status !== "in_progress") {
      return Response.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Active cooking session not found",
          },
        },
        { status: 404 },
      );
    }
    const context = activeCookingContext(trusted);
    if (!context) {
      return Response.json(
        {
          error: {
            code: "INVALID_SESSION",
            message: "Cooking session is incomplete",
          },
        },
        { status: 409 },
      );
    }

    const { object } = (await measuredGenerate(
      "cooking-assistant",
      {
        model: getModel("assistant"),
        schema: assistantReplySchema,
        temperature: 0.7,
        system: cookingPrompt(context, "text"),
        prompt: question,
      },
      undefined,
      {
        userId: user.id,
        route: "/api/ai/assistant",
        capability: "cooking-assistant",
        modality: "text",
        sessionId,
      },
    )) as { object: z.infer<typeof assistantReplySchema> };

    await logSessionEvent(supabase, {
      userId: user.id,
      sessionId,
      stepIndex: context.session.current_step,
      kind: "qa",
      payload: { question, answer: object.answer, channel: channel ?? "text" },
    });

    return Response.json(object);
  },
});
