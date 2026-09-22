import { NextResponse } from "next/server";
import { z } from "zod";
import { measuredGenerate } from "@/lib/ai/instrument";
import { getModel } from "@/lib/ai/model";
import { renderPrompt } from "@/lib/ai/prompts";
import { stepCheckSchema } from "@/lib/ai/schemas/cooking";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  image: z.string().min(1).max(5_000_000),
  context: z.object({
    recipeTitle: z.string(),
    stepTitle: z.string(),
    instruction: z.string(),
    photoCheckpoint: z.string().optional(),
  }),
});

/**
 * POST /api/ai/step-check
 * Camera checkpoint during cooking: the user photographs their food mid-step
 * and gets practical feedback on whether it looks right.
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
    const { image, context } = parsed.data;

    const { object } = await measuredGenerate("step-check", {
      model: getModel(),
      schema: stepCheckSchema,
      temperature: 0.4,
      system: renderPrompt("step-check", {}),
      messages: [
        {
          role: "user" as const,
          content: [
            {
              type: "text" as const,
              text: [
                `Recipe: ${context.recipeTitle}`,
                `Step: ${context.stepTitle}`,
                `Instruction: ${context.instruction}`,
                context.photoCheckpoint
                  ? `Expected result: ${context.photoCheckpoint}`
                  : "",
                "Does this look right?",
              ]
                .filter(Boolean)
                .join("\n"),
            },
            { type: "image" as const, image },
          ],
        },
      ],
    });

    return NextResponse.json(object);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Step check failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
