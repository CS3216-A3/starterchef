import { z } from "zod";
import { measuredGenerate } from "@/lib/ai/instrument";
import { getModel } from "@/lib/ai/model";
import { renderPrompt } from "@/lib/ai/prompts";
import { AI_OPERATION_COSTS, withAiRoute } from "@/lib/ai/route";
import { assistantReplySchema } from "@/lib/ai/schemas/assistant";
import { getCookingMemory, logSessionEvent } from "@/lib/session-events";

const requestSchema = z.object({
  question: z.string().min(1).max(1000),
  // Optional session linkage — when present the exchange is recorded on the
  // session timeline (works for both the text box and the voice button).
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
  async loadContext({ input, supabase, user }) {
    const [memory, { data: profile }, { data: session }, { data: pantry }] =
      await Promise.all([
        getCookingMemory(supabase, user.id),
        supabase
          .from("profiles")
          .select("dietary_restrictions, allergies")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("cooking_sessions")
          .select("id,recipe,current_step,status,adjustments")
          .eq("id", input.sessionId)
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("kitchen_items")
          .select("kind,name,quantity")
          .eq("user_id", user.id),
      ]);
    return { memory, profile, session, pantry: pantry ?? [] };
  },
  async handler({ input, trusted, supabase, user }) {
    const { question, sessionId, channel } = input;
    const { memory, profile, session, pantry } = trusted;
    if (!session || session.status !== "in_progress") {
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
    const snapshot = session.recipe as {
      title?: string;
      ingredients?: string[];
      equipment?: string[];
      steps?: { index?: number; title?: string; instruction?: string }[];
    };
    const currentStep = snapshot.steps?.find(
      (step) => step.index === session.current_step,
    );
    if (!snapshot.title || !currentStep?.title) {
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

    const list = (v: string[] | null | undefined) =>
      v && v.length > 0 ? v.join(", ") : "none";

    const { object } = (await measuredGenerate("cooking-assistant", {
      model: getModel("assistant"),
      schema: assistantReplySchema,
      temperature: 0.7,
      system: renderPrompt("cooking-assistant", {
        recipeTitle: snapshot.title,
        stepTitle: currentStep.title,
        stepInstruction: currentStep.instruction ?? "",
        recipeIngredients: list(snapshot.ingredients),
        recipeEquipment: list(snapshot.equipment),
        memory: memory.length
          ? memory.map((f) => `- ${f}`).join("\n")
          : "- Nothing recorded yet — this may be their first session.",
        dietaryRestrictions: list(profile?.dietary_restrictions),
        allergies: list(profile?.allergies),
        pantry:
          pantry
            .map(
              (item) =>
                `${item.kind}: ${item.name}${item.quantity ? ` (${item.quantity})` : ""}`,
            )
            .join(", ") || "none",
        adjustments: JSON.stringify(session.adjustments ?? []),
      }),
      prompt: question,
    })) as { object: z.infer<typeof assistantReplySchema> };

    await logSessionEvent(supabase, {
      userId: user.id,
      sessionId,
      stepIndex: session.current_step,
      kind: "qa",
      payload: { question, answer: object.answer, channel: channel ?? "text" },
    });

    return Response.json(object);
  },
});
