import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { VoiceProvider } from "@/lib/ai/voice";

/**
 * POST /api/ai/realtime/session
 * Returns the connection config for the requested native-audio provider.
 *
 * - OpenAI: creates an ephemeral session token server-side (API key never
 *   reaches the browser).
 * - Gemini: returns model + instructions. The client connects directly with
 *   NEXT_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY. This is acceptable for a
 *   prototype; production should proxy through a server-side WebSocket.
 */

export async function POST(request: Request) {
  const { provider } = (await request.json()) as { provider: VoiceProvider };

  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured" },
        { status: 503 },
      );
    }

    const openai = new OpenAI({ apiKey });
    const model =
      process.env.OPENAI_REALTIME_MODEL ?? "gpt-4o-realtime-preview-2024-10-01";

    try {
      const session = await openai.beta.realtime.sessions.create({
        model: model as "gpt-4o-realtime-preview-2024-10-01",
        instructions: buildSystemInstructions(),
        voice: (process.env.OPENAI_REALTIME_VOICE ?? "alloy") as "alloy",
      });

      return NextResponse.json({
        provider: "openai",
        model,
        token: session.client_secret.value,
        expiresAt: session.client_secret.expires_at,
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
      model: process.env.GOOGLE_LIVE_MODEL ?? "gemini-2.0-flash-exp",
      instructions: buildSystemInstructions(),
    });
  }

  return NextResponse.json(
    { error: "Provider not supported by realtime session route" },
    { status: 400 },
  );
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
