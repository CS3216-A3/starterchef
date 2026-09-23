import { z } from "zod";
import { measuredGenerate } from "@/lib/ai/instrument";
import { getModel } from "@/lib/ai/model";
import { renderPrompt } from "@/lib/ai/prompts";
import { AI_OPERATION_COSTS, withAiRoute } from "@/lib/ai/route";
import { kitchenScanSchema } from "@/lib/ai/schemas/kitchen-scan";

const requestSchema = z.object({ image: z.string().min(1).max(12_000_000) });

/**
 * POST /api/ai/kitchen-scan
 * Body: { image: string } — data URL or base64-encoded photo of the kitchen.
 * Returns a KitchenScanResult. Detected items are suggestions — the client
 * must present them for confirmation before saving to the inventory.
 */
export const POST = withAiRoute({
  schema: requestSchema,
  cost: AI_OPERATION_COSTS.scan,
  async handler({ input: { image } }) {
    const { object } = await measuredGenerate("kitchen-scan", {
      model: getModel("kitchen-scan"),
      schema: kitchenScanSchema,
      temperature: 0.4,
      system: renderPrompt("kitchen-scan", {}),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Identify the ingredients and cooking equipment in this photo.",
            },
            { type: "image", image },
          ],
        },
      ],
    });

    return Response.json(object);
  },
});
