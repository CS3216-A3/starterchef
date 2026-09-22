import { NextResponse } from "next/server";
import { z } from "zod";
import { measuredGenerate } from "@/lib/ai/instrument";
import { getModel } from "@/lib/ai/model";
import { renderPrompt } from "@/lib/ai/prompts";
import { assistantReplySchema } from "@/lib/ai/schemas/assistant";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { getCookingMemory, logSessionEvent } from "@/lib/session-events";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  question: z.string().min(1).max(1000),
  context: z.object({
    recipeTitle: z.string(),
    stepTitle: z.string(),
  }),
  // Optional session linkage — when present the exchange is recorded on the
  // session timeline (works for both the text box and the voice button).
  sessionId: z.string().uuid().optional(),
  stepIndex: z.number().int().min(1).optional(),
  channel: z.enum(["text", "voice"]).optional(),
});

/**
 * POST /api/ai/assistant
 * In-cooking Q&A. `context` grounds the answer in the user's current recipe
 * step, and `getCookingMemory` adds what past sessions taught us about how
 * this person cooks. The reply's optional `action` is a suggestion — the UI
 * offers it, the user confirms.
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
    const { question, context, sessionId, stepIndex, channel } = parsed.data;

    const [memory, { data: profile }] = await Promise.all([
      getCookingMemory(supabase, user.id),
      supabase
        .from("profiles")
        .select("dietary_restrictions, allergies")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    const list = (v: string[] | null | undefined) =>
      v && v.length > 0 ? v.join(", ") : "none";

    const { object } = (await measuredGenerate("cooking-assistant", {
      model: getModel(),
      schema: assistantReplySchema,
      temperature: 0.7,
      system: renderPrompt("cooking-assistant", {
        recipeTitle: context.recipeTitle,
        stepTitle: context.stepTitle,
        memory: memory.length
          ? memory.map((f) => `- ${f}`).join("\n")
          : "- Nothing recorded yet — this may be their first session.",
        dietaryRestrictions: list(profile?.dietary_restrictions),
        allergies: list(profile?.allergies),
      }),
      prompt: question,
    })) as { object: z.infer<typeof assistantReplySchema> };

    await logSessionEvent(supabase, {
      userId: user.id,
      sessionId,
      stepIndex,
      kind: "qa",
      payload: { question, answer: object.answer, channel: channel ?? "text" },
    });

    return NextResponse.json(object);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Assistant request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
