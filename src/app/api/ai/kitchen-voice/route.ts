import { NextResponse } from "next/server";
import { z } from "zod";
import { measuredGenerate } from "@/lib/ai/instrument";
import { getModel } from "@/lib/ai/model";
import { renderPrompt } from "@/lib/ai/prompts";
import { kitchenVoiceSchema } from "@/lib/ai/schemas/kitchen-scan";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  transcript: z.string().min(1).max(2000),
});

/**
 * POST /api/ai/kitchen-voice
 * Turns a dictated list ("two tomatoes and a frying pan") into structured
 * kitchen items. The client saves the result via saveKitchenItems — the
 * model only parses, never writes.
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

    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { object } = await measuredGenerate("kitchen-voice", {
      model: getModel(),
      schema: kitchenVoiceSchema,
      temperature: 0.2,
      system: renderPrompt("kitchen-voice", {}),
      prompt: parsed.data.transcript,
    });

    return NextResponse.json(object);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not parse that list";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
