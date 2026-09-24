import { createHash } from "node:crypto";
import { z } from "zod";
import {
  activeCookingContext,
  cookingPrompt,
  loadCookingAssistantContext,
} from "@/lib/ai/cooking-context";
import { protectedError, withProtectedRoute } from "@/lib/protected-route";
import {
  VOICE_PROPOSAL_DESCRIPTION,
  VOICE_PROPOSAL_PARAMETERS,
} from "@/lib/ai/voice-proposal";

const bodySchema = z
  .object({
    sessionId: z.uuid(),
    attemptId: z.uuid(),
    fallbackFrom: z.literal("openai").nullable(),
  })
  .strict();
const MODELS = {
  openai: ["gpt-realtime-2.1-mini", "gpt-realtime-2.1"],
  gemini: ["gemini-3.8-live"],
} as const;

function modelFor(provider: "openai" | "gemini") {
  const configured =
    provider === "openai"
      ? (process.env.OPENAI_REALTIME_MODEL ?? MODELS.openai[0])
      : (process.env.GOOGLE_LIVE_MODEL ?? MODELS.gemini[0]);
  return (MODELS[provider] as readonly string[]).includes(configured)
    ? configured
    : null;
}

/** A logical attempt is charged exactly once by the database. Browser JSON
 * provides IDs only; all voice instructions come from the owned snapshot. */
export const POST = withProtectedRoute(async (context) => {
  const parsed = bodySchema.safeParse(
    await context.request.json().catch(() => null),
  );
  if (!parsed.success)
    return protectedError(
      context,
      400,
      "INVALID_REQUEST",
      "Invalid realtime session request",
    );
  const input = parsed.data;
  const owned = activeCookingContext(
    await loadCookingAssistantContext(
      context.supabase,
      context.user.id,
      input.sessionId,
    ),
  );
  if (!owned)
    return protectedError(
      context,
      404,
      "NOT_FOUND",
      "Active cooking session not found",
    );
  const { data: claimed, error: claimError } = await context.supabase.rpc(
    "claim_realtime_attempt",
    {
      p_session_id: input.sessionId,
      p_attempt_id: input.attemptId,
      p_fallback_from: input.fallbackFrom,
    },
  );
  if (claimError) {
    const status =
      claimError.code === "P0001"
        ? 429
        : claimError.code === "P0002"
          ? 404
          : 409;
    return protectedError(
      context,
      status,
      status === 429 ? "RATE_LIMITED" : "CONFLICT",
      status === 429
        ? "Daily AI credit limit reached"
        : "Realtime attempt is unavailable",
    );
  }
  const provider = claimed as "openai" | "gemini";
  const model = modelFor(provider);
  if (!model)
    return protectedError(
      context,
      503,
      "INTERNAL_ERROR",
      "Realtime model is unavailable",
    );
  const instructions = cookingPrompt(owned, "live");
  const { data: attempt } = await context.supabase
    .from("realtime_attempts")
    .select("expires_at")
    .eq("id", input.attemptId)
    .eq("session_id", input.sessionId)
    .eq("user_id", context.user.id)
    .maybeSingle();
  if (!attempt)
    return protectedError(
      context,
      409,
      "CONFLICT",
      "Realtime attempt is unavailable",
    );
  const sessionDeadlineAt = attempt.expires_at;
  try {
    return await issueCredential(
      provider,
      model,
      instructions,
      context.user.id,
      input.attemptId,
      sessionDeadlineAt,
    );
  } catch {
    // No media has begun when credential creation fails. Reuse the charged
    // logical attempt; the database permits this transition only once.
    if (provider === "openai") {
      const { data: fallback, error } = await context.supabase.rpc(
        "claim_realtime_attempt",
        {
          p_session_id: input.sessionId,
          p_attempt_id: input.attemptId,
          p_fallback_from: "openai",
        },
      );
      const geminiModel = modelFor("gemini");
      if (!error && fallback === "gemini" && geminiModel) {
        try {
          return await issueCredential(
            "gemini",
            geminiModel,
            instructions,
            context.user.id,
            input.attemptId,
            sessionDeadlineAt,
          );
        } catch {
          /* the typed assistant remains available */
        }
      }
    }
    return protectedError(
      context,
      503,
      "INTERNAL_ERROR",
      "Live voice is unavailable; use the text assistant",
    );
  }
});

async function issueCredential(
  provider: "openai" | "gemini",
  model: string,
  instructions: string,
  userId: string,
  attemptId: string,
  sessionDeadlineAt: string,
) {
  if (provider === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("openai_unavailable");
    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": createHash("sha256")
            .update(userId)
            .digest("hex"),
        },
        body: JSON.stringify({
          session: {
            type: "realtime",
            model,
            instructions,
            audio: {
              output: { voice: process.env.OPENAI_REALTIME_VOICE ?? "marin" },
            },
            tools: [
              {
                type: "function",
                name: "propose_cooking_action",
                description: VOICE_PROPOSAL_DESCRIPTION,
                parameters: VOICE_PROPOSAL_PARAMETERS,
              },
            ],
            tool_choice: "auto",
          },
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) throw new Error("openai_unavailable");
    const data = (await response.json()) as {
      value?: string;
      expires_at?: number;
    };
    if (!data.value) throw new Error("openai_unavailable");
    return Response.json({
      provider,
      model,
      credential: data.value,
      expiresAt: data.expires_at ?? Math.floor(Date.now() / 1000) + 60,
      attemptId,
      sessionDeadlineAt,
    });
  }
  if (
    process.env.AI_GEMINI_LIVE_ENABLED !== "true" ||
    !process.env.GOOGLE_GENERATIVE_AI_API_KEY
  )
    throw new Error("gemini_unavailable");
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/auth_tokens",
    {
      method: "POST",
      headers: {
        "x-goog-api-key": process.env.GOOGLE_GENERATIVE_AI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uses: 3,
        expireTime: expiresAt,
        newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
        liveConnectConstraints: {
          model: `models/${model}`,
          config: {
            responseModalities: ["AUDIO"],
            systemInstruction: { parts: [{ text: instructions }] },
            tools: [
              {
                functionDeclarations: [
                  {
                    name: "propose_cooking_action",
                    description: VOICE_PROPOSAL_DESCRIPTION,
                    parameters: VOICE_PROPOSAL_PARAMETERS,
                  },
                ],
              },
            ],
          },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error("gemini_unavailable");
  const data = (await response.json()) as { name?: string };
  if (!data.name) throw new Error("gemini_unavailable");
  return Response.json({
    provider,
    model,
    credential: data.name,
    expiresAt,
    attemptId,
    sessionDeadlineAt,
  });
}
