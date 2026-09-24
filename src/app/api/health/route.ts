import {
  getModelName,
  getProvider,
  isSelectedProviderConfigured,
} from "@/lib/ai/model";

export async function GET() {
  return Response.json({
    ok: true,
    aiProvider: getProvider(),
    aiModel: getModelName(),
    aiConfigured: isSelectedProviderConfigured(),
  });
}
