import { measuredGenerate } from "@/lib/ai/instrument";
import { getModel } from "@/lib/ai/model";
import { renderPrompt } from "@/lib/ai/prompts";
import { sessionRecapSchema } from "@/lib/ai/schemas/cooking";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

/** Optional recap. The Workflow argument carries only an opaque session ID;
 * bounded history and the owner are loaded inside a durable step. */
export async function sessionRecapWorkflow(sessionId: string) {
  "use workflow";
  await generateRecap(sessionId);
}

async function generateRecap(sessionId: string) {
  "use step";
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("cooking_sessions")
    .select("id,user_id,status,summary")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.status !== "completed" || session.summary) return;
  const { data: events } = await admin
    .from("session_events")
    .select("step_index,kind,payload")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(40);
  if (!events?.length) return;
  const quota = await checkRateLimit(session.user_id, 1, admin);
  if (!quota.allowed) return;
  const timeline = JSON.stringify(events).slice(0, 12_000);
  const { object } = await measuredGenerate("session-recap", {
    model: getModel(),
    schema: sessionRecapSchema,
    temperature: 0.3,
    system: renderPrompt("session-recap", {}),
    prompt: timeline,
  });
  await admin
    .from("cooking_sessions")
    .update({ summary: object })
    .eq("id", sessionId)
    .eq("status", "completed")
    .is("summary", null);
}
