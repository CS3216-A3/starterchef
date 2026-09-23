import { createHash } from "node:crypto";
import { z } from "zod";
import { AI_OPERATION_COSTS, withAiRoute } from "@/lib/ai/route";
import { protectedError } from "@/lib/protected-route";

const requestSchema = z.object({
  provider: z.enum(["openai", "gemini"]),
  sessionId: z.uuid(),
});
const MODELS = {
  openai: ["gpt-realtime-2.1-mini", "gpt-realtime-2.1"],
  gemini: ["gemini-3.8-live"],
} as const;

function configuredModel(provider: "openai" | "gemini") {
  const fallback = MODELS[provider][0];
  const model =
    provider === "openai"
      ? (process.env.OPENAI_REALTIME_MODEL ?? fallback)
      : (process.env.GOOGLE_LIVE_MODEL ?? fallback);
  return (MODELS[provider] as readonly string[]).includes(model) ? model : null;
}

/** Mints a short-lived provider credential after loading the actual active
 * session. Audio never traverses Vercel and no transcript is persisted here. */
export const POST = withAiRoute({
  schema: requestSchema,
  cost: AI_OPERATION_COSTS["realtime-session"],
  async loadContext({ input, supabase, user }) {
    const { data } = await supabase
      .from("cooking_sessions")
      .select("recipe,current_step,status")
      .eq("id", input.sessionId)
      .eq("user_id", user.id)
      .maybeSingle();
    return data;
  },
  shouldCharge: (session) =>
    Boolean(session && session.status === "in_progress"),
  async handler({ input, trusted: session, user, requestId }) {
    if (!session || session.status !== "in_progress")
      return protectedError(
        { requestId },
        404,
        "NOT_FOUND",
        "Active cooking session not found",
      );
    const model = configuredModel(input.provider);
    if (!model)
      return protectedError(
        { requestId },
        500,
        "INTERNAL_ERROR",
        "Realtime model is not approved",
      );
    const recipe = session.recipe as {
      title?: string;
      steps?: { index?: number; title?: string }[];
    };
    const step = recipe.steps?.find(
      (candidate) => candidate.index === session.current_step,
    );
    const instructions = [
      "You are StarterChef, a concise, safety-conscious cooking assistant.",
      `Recipe: ${recipe.title ?? "the current recipe"}.`,
      `Current step: ${step?.title ?? session.current_step}.`,
      "Offer advice and adjustment proposals only; never claim to change the recipe or session.",
      "Keep replies suitable for speech, under three sentences.",
    ].join(" ");
    if (input.provider === "openai") {
      const key = process.env.OPENAI_API_KEY;
      if (!key)
        return protectedError(
          { requestId },
          503,
          "INTERNAL_ERROR",
          "Realtime provider is unavailable",
        );
      const response = await fetch(
        "https://api.openai.com/v1/realtime/sessions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            instructions,
            voice: process.env.OPENAI_REALTIME_VOICE ?? "alloy",
            client_secret: { expires_after: { seconds: 900 } },
            safety_identifier: createHash("sha256")
              .update(user.id)
              .digest("hex"),
          }),
        },
      );
      if (!response.ok)
        return protectedError(
          { requestId },
          502,
          "INTERNAL_ERROR",
          "Realtime provider rejected session",
        );
      const data = (await response.json()) as {
        client_secret?: { value?: string; expires_at?: number };
      };
      if (!data.client_secret?.value || !data.client_secret.expires_at)
        return protectedError(
          { requestId },
          502,
          "INTERNAL_ERROR",
          "Realtime provider returned no credential",
        );
      return Response.json({
        provider: "openai",
        model,
        credential: data.client_secret.value,
        expiresAt: data.client_secret.expires_at,
      });
    }
    if (process.env.AI_GEMINI_LIVE_ENABLED !== "true")
      return protectedError(
        { requestId },
        503,
        "INTERNAL_ERROR",
        "Gemini Live is not enabled",
      );
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key)
      return protectedError(
        { requestId },
        503,
        "INTERNAL_ERROR",
        "Realtime provider is unavailable",
      );
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1alpha/authTokens?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uses: 1,
          expireTime: expiresAt,
          newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
          bidiGenerateContentSetup: {
            model: `models/${model}`,
            systemInstruction: { parts: [{ text: instructions }] },
          },
        }),
      },
    );
    if (!response.ok)
      return protectedError(
        { requestId },
        502,
        "INTERNAL_ERROR",
        "Realtime provider rejected session",
      );
    const data = (await response.json()) as { name?: string };
    if (!data.name)
      return protectedError(
        { requestId },
        502,
        "INTERNAL_ERROR",
        "Realtime provider returned no credential",
      );
    return Response.json({
      provider: "gemini",
      model,
      credential: data.name,
      expiresAt,
    });
  },
});
