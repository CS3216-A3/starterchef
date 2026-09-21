import { getProvider } from "@/lib/ai/model";

export async function GET() {
  return Response.json({
    ok: true,
    aiProvider: getProvider(),
    aiConfigured: Boolean(
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.OPENAI_API_KEY,
    ),
  });
}
