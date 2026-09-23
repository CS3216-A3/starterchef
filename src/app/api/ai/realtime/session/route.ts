import { z } from "zod";
import { VOICE_PROVIDERS } from "@/lib/ai/voice";
import { withAiRoute } from "@/lib/ai/route";

const requestSchema = z.object({
  provider: z.enum(VOICE_PROVIDERS).refine((value) => value !== "web-speech"),
});

/**
 * POST /api/ai/realtime/session
 * Returns the connection config for the requested native-audio provider.
 *
 * - OpenAI: creates an ephemeral session token server-side via direct HTTP call
 *   (avoids SDK type/version lock-in for new model names).
 * - Gemini: creates a constrained, single-use ephemeral token server-side.
 */

export const POST = withAiRoute({
  schema: requestSchema,
  cost: 1,
  async handler({ input: { provider } }) {
    if (provider === "openai") {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("Realtime provider is unavailable");

      const model =
        process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2.1-mini";
      const voice = process.env.OPENAI_REALTIME_VOICE ?? "alloy";

      const response = await fetch(
        "https://api.openai.com/v1/realtime/sessions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            instructions: buildSystemInstructions(),
            voice,
          }),
        },
      );

      if (!response.ok) throw new Error("Realtime provider rejected session");

      const data = (await response.json()) as {
        client_secret: { value: string; expires_at: number };
      };

      return Response.json({
        provider: "openai",
        model,
        token: data.client_secret.value,
        expiresAt: data.client_secret.expires_at,
      });
    }

    if (provider === "gemini") {
      const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (!apiKey) throw new Error("Realtime provider is unavailable");
      const model = process.env.GOOGLE_LIVE_MODEL ?? "gemini-3.8-live";
      const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();
      const tokenResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1alpha/authTokens?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uses: 1,
            expireTime: expiresAt,
            newSessionExpireTime: new Date(
              Date.now() + 60 * 1000,
            ).toISOString(),
            bidiGenerateContentSetup: { model: `models/${model}` },
          }),
        },
      );
      if (!tokenResponse.ok)
        throw new Error("Realtime provider rejected session");
      const tokenData = (await tokenResponse.json()) as { name?: string };
      if (!tokenData.name)
        throw new Error("Realtime provider returned no token");
      return Response.json({
        provider: "gemini",
        model,
        token: tokenData.name,
        expiresAt,
        instructions: buildSystemInstructions(),
      });
    }

    throw new Error("Realtime provider is unavailable");
  },
});

function buildSystemInstructions(): string {
  return [
    "You are StarterChef, a warm and concise sous-chef helping a beginner cook one step at a time.",
    "Keep replies to 1-3 short sentences suitable for text-to-speech.",
    "If asked for a substitution, give one concrete option and note any trade-off.",
    "If describing a problem (too salty, sticking), give the single best fix first.",
    "Never shame the user; keep the tone encouraging.",
    "Current recipe: {{recipeTitle}}. Current step: {{stepTitle}}.",
    "These placeholders are replaced by the client before the session starts.",
  ].join(" ");
}
