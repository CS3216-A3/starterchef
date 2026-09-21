import { NextResponse } from "next/server";
import { z } from "zod";
import { measuredGenerate } from "@/lib/ai/instrument";
import { getModel } from "@/lib/ai/model";
import { renderPrompt } from "@/lib/ai/prompts";
import { assistantReplySchema } from "@/lib/ai/schemas/assistant";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  question: z.string().min(1).max(1000),
  context: z.object({
    recipeTitle: z.string(),
    stepTitle: z.string(),
  }),
});

/**
 * POST /api/ai/assistant
 * In-cooking Q&A. `context` grounds the answer in the user's current recipe
 * step. The reply's optional `action` is a suggestion — the UI offers it, the
 * user confirms.
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
    const { question, context } = parsed.data;

    const { object } = await measuredGenerate("cooking-assistant", {
      model: getModel(),
      schema: assistantReplySchema,
      system: renderPrompt("cooking-assistant", {
        recipeTitle: context.recipeTitle,
        stepTitle: context.stepTitle,
      }),
      prompt: question,
    });

    return NextResponse.json(object);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Assistant request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
