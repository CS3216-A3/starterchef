import { NextResponse } from "next/server";
import { VOICE_PROVIDERS, type VoiceProvider } from "@/lib/ai/voice";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/ai/realtime/session
 * Returns the connection config for the requested native-audio provider.
 *
 * - OpenAI: creates an ephemeral session token server-side via direct HTTP call
 *   (avoids SDK type/version lock-in for new model names).
 * - Gemini: returns model + instructions. The client connects directly with
 *   NEXT_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY. This is acceptable for a
 *   prototype; production should proxy through a server-side WebSocket.
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

    const body = (await request.json().catch(() => null)) as {
      provider?: VoiceProvider;
    } | null;
    const provider = body?.provider;
    if (
      !provider ||
      !(VOICE_PROVIDERS as readonly string[]).includes(provider)
    ) {
      return NextResponse.json(
        { error: "Invalid voice provider" },
        { status: 400 },
      );
    }

    if (provider === "openai") {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: "OPENAI_API_KEY is not configured" },
          { status: 503 },
        );
      }

      const model =
        process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2.1-mini";
      const voice = process.env.OPENAI_REALTIME_VOICE ?? "alloy";

      try {
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

        if (!response.ok) {
          const text = await response.text();
          return NextResponse.json(
            { error: `OpenAI session failed: ${text}` },
            { status: response.status },
          );
        }

        const data = (await response.json()) as {
          client_secret: { value: string; expires_at: number };
        };

        return NextResponse.json({
          provider: "openai",
          model,
          token: data.client_secret.value,
          expiresAt: data.client_secret.expires_at,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "OpenAI session failed";
        return NextResponse.json({ error: message }, { status: 502 });
      }
    }

    if (provider === "gemini") {
      return NextResponse.json({
        provider: "gemini",
        model: process.env.GOOGLE_LIVE_MODEL ?? "gemini-3.8-live",
        instructions: buildSystemInstructions(),
      });
    }

    return NextResponse.json(
      { error: "Provider not supported by realtime session route" },
      { status: 400 },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Realtime session failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

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
