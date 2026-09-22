import { NextResponse } from "next/server";
import { z } from "zod";
import { measuredGenerate } from "@/lib/ai/instrument";
import { getModel } from "@/lib/ai/model";
import { renderPrompt } from "@/lib/ai/prompts";
import { stepCheckSchema, type StepCheck } from "@/lib/ai/schemas/cooking";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { logSessionEvent } from "@/lib/session-events";
import { createClient } from "@/lib/supabase/server";
import { friendlyAiError } from "@/lib/ai/errors";

const requestSchema = z.object({
  image: z.string().min(1).max(5_000_000),
  context: z.object({
    recipeTitle: z.string(),
    stepTitle: z.string(),
    instruction: z.string(),
    photoCheckpoint: z.string().optional(),
  }),
  sessionId: z.string().uuid().optional(),
  stepIndex: z.number().int().min(1).optional(),
  // "Show and ask": when the camera is on, a question comes with a snapped
  // frame — the model answers it using what it sees.
  question: z.string().min(1).max(1000).optional(),
  // Lets the checkpoint photo persist on the step itself.
  recipeId: z.string().uuid().optional(),
  recipeSlug: z.string().optional(),
});

type StepWithPhoto = { index?: number; photoUrl?: string } & Record<
  string,
  unknown
>;

/** Save the checkpoint photo onto the step: owned recipes get it written
 *  into recipes.steps (shows on the overview forever); the active session
 *  snapshot gets it too so catalogue cooks see it on revisit. */
async function saveCheckpointPhoto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  photoUrl: string,
  stepIndex: number | undefined,
  recipeId: string | undefined,
  recipeSlug: string | undefined,
  sessionId: string | undefined,
) {
  if (!stepIndex) return;
  const withPhoto = (steps: StepWithPhoto[]) =>
    steps.map((s) => (s.index === stepIndex ? { ...s, photoUrl } : s));

  if (recipeId) {
    const { data: recipe } = await supabase
      .from("recipes")
      .select("id, steps")
      .eq("id", recipeId)
      .eq("user_id", userId)
      .maybeSingle();
    if (recipe) {
      await supabase
        .from("recipes")
        .update({
          steps: withPhoto((recipe.steps as StepWithPhoto[]) ?? []),
        })
        .eq("id", recipeId);
    }
  }

  if (sessionId && recipeSlug) {
    const { data: session } = await supabase
      .from("cooking_sessions")
      .select("id, recipe")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    const snapshot = session?.recipe as {
      slug?: string;
      steps?: StepWithPhoto[];
    } | null;
    if (snapshot?.slug === recipeSlug && snapshot.steps) {
      await supabase
        .from("cooking_sessions")
        .update({
          recipe: { ...snapshot, steps: withPhoto(snapshot.steps) },
        })
        .eq("id", sessionId);
    }
  }
}

/** Persist the checkpoint photo so the verdict in the timeline keeps its
 *  evidence. Best-effort — a failed upload never blocks the feedback. */
async function uploadCheckpointPhoto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  sessionId: string,
  dataUrl: string,
): Promise<string | null> {
  const match = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const [, mime, base64] = match;
  const ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  const path = `${userId}/checkpoints/${sessionId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("recipe-images")
    .upload(path, Buffer.from(base64, "base64"), { contentType: mime });
  if (error) return null;
  return supabase.storage.from("recipe-images").getPublicUrl(path).data
    .publicUrl;
}

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
    const {
      image,
      context,
      sessionId,
      stepIndex,
      question,
      recipeId,
      recipeSlug,
    } = parsed.data;

    // Give the model memory of past checkpoints as text — the verdicts and
    // feedback from recent checks, so it can build on them ("still too
    // pale") without paying for extra image tokens.
    let pastSummary = "";
    if (sessionId) {
      const { data: pastChecks } = await supabase
        .from("session_events")
        .select("payload, created_at")
        .eq("session_id", sessionId)
        .eq("kind", "photo_check")
        .order("created_at", { ascending: false })
        .limit(5);
      pastSummary = (pastChecks ?? [])
        .reverse()
        .map((e) => {
          const p = e.payload as {
            stepTitle?: string;
            looksRight?: boolean;
            feedback?: string;
          };
          const verdict =
            p.looksRight === true
              ? "looked right"
              : p.looksRight === false
                ? "needed a fix"
                : "unclear";
          return `- ${p.stepTitle ?? "A step"}: ${verdict}. ${p.feedback ?? ""}`;
        })
        .join("\n");
    }

    const { object } = (await measuredGenerate("step-check", {
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
                pastSummary
                  ? `Earlier checks in this session:\n${pastSummary}`
                  : "",
                question
                  ? `The cook asks: "${question}" — answer it using the photo, then judge whether it looks right.`
                  : "Does this look right?",
              ]
                .filter(Boolean)
                .join("\n"),
            },
            { type: "image" as const, image },
          ],
        },
      ],
    })) as { object: StepCheck };

    if (sessionId) {
      const photoUrl = await uploadCheckpointPhoto(
        supabase,
        user.id,
        sessionId,
        image,
      );
      if (photoUrl) {
        await saveCheckpointPhoto(
          supabase,
          user.id,
          photoUrl,
          stepIndex,
          recipeId,
          recipeSlug,
          sessionId,
        );
      }
      await logSessionEvent(supabase, {
        userId: user.id,
        sessionId,
        stepIndex,
        kind: "photo_check",
        payload: {
          photoUrl: photoUrl ?? undefined,
          question: question ?? undefined,
          looksRight: object.looksRight,
          feedback: object.feedback,
          tip: object.tip,
          stepTitle: context.stepTitle,
        },
      });
    }

    return NextResponse.json(object);
  } catch (err) {
    const message = friendlyAiError(err, "Step check failed");
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
