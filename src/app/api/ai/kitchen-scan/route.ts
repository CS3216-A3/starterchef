import { NextResponse } from "next/server";
import { measuredGenerate } from "@/lib/ai/instrument";
import { getModel } from "@/lib/ai/model";
import { renderPrompt } from "@/lib/ai/prompts";
import { kitchenScanSchema } from "@/lib/ai/schemas/kitchen-scan";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/ai/kitchen-scan
 * Body: { image: string } — data URL or base64-encoded photo of the kitchen.
 * Returns a KitchenScanResult. Detected items are suggestions — the client
 * must present them for confirmation before saving to the inventory.
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

    const { image } = (await request.json()) as { image?: string };
    if (!image) {
      return NextResponse.json(
        { error: "Missing `image` (data URL or base64)." },
        { status: 400 },
      );
    }

    const { object } = await measuredGenerate("kitchen-scan", {
      model: getModel(),
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

    return NextResponse.json(object);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Kitchen scan failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
