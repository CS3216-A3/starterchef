import { z } from "zod";
import { measuredGenerate } from "@/lib/ai/instrument";
import { getModel } from "@/lib/ai/model";
import { renderPrompt } from "@/lib/ai/prompts";
import { AI_OPERATION_COSTS, withAiRoute } from "@/lib/ai/route";
import { kitchenVoiceSchema } from "@/lib/ai/schemas/kitchen-scan";

const requestSchema = z.object({
  transcript: z.string().min(1).max(2000),
});

/**
 * POST /api/ai/kitchen-voice
 * Turns a dictated list ("two tomatoes and a frying pan") into structured
 * kitchen items. The client saves the result via saveKitchenItems — the
 * model only parses, never writes.
 */
export const POST = withAiRoute({
  schema: requestSchema,
  cost: AI_OPERATION_COSTS["kitchen-voice"],
  async handler({ input }) {
    const { object } = await measuredGenerate("kitchen-voice", {
      model: getModel("kitchen-voice"),
      schema: kitchenVoiceSchema,
      temperature: 0.2,
      system: renderPrompt("kitchen-voice", {}),
      prompt: input.transcript,
    });
    return Response.json(object);
  },
});
