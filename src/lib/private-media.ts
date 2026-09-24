import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  RecipeRow,
  RecipeStep,
  SessionEventRow,
  SessionRecipeSnapshot,
} from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;
const PREFIX = "recipe-inputs:";

export function privateMediaReference(path: string) {
  return `${PREFIX}${path}`;
}

export function privateMediaPath(reference: string) {
  return reference.startsWith(PREFIX) ? reference.slice(PREFIX.length) : null;
}

export async function resolveMediaReference(
  supabase: Supabase,
  reference: string | null | undefined,
): Promise<string | undefined> {
  if (!reference) return undefined;
  const path = privateMediaPath(reference);
  if (!path) return reference;
  const { data, error } = await supabase.storage
    .from("recipe-inputs")
    .createSignedUrl(path, 10 * 60);
  if (error) throw new Error("Could not authorize private media");
  return data.signedUrl;
}

export async function resolveRecipeMedia(
  supabase: Supabase,
  recipe: RecipeRow,
) {
  const steps = await Promise.all(
    recipe.steps.map(async (step): Promise<RecipeStep> => ({
      ...step,
      photoUrl: await resolveMediaReference(supabase, step.photoUrl),
    })),
  );
  return {
    ...recipe,
    image_reference: recipe.image_url,
    image_url:
      (await resolveMediaReference(supabase, recipe.image_url)) ?? null,
    steps,
  };
}

export async function resolveSessionRecipeMedia(
  supabase: Supabase,
  recipe: SessionRecipeSnapshot,
) {
  if (!recipe.steps) return recipe;
  return {
    ...recipe,
    steps: await Promise.all(
      recipe.steps.map(async (step) => ({
        ...step,
        photoUrl: await resolveMediaReference(supabase, step.photoUrl),
      })),
    ),
  };
}

export async function resolveEventMedia(
  supabase: Supabase,
  event: SessionEventRow,
) {
  if (typeof event.payload.checkpointId === "string") {
    const { data: checkpoint } = await supabase
      .from("cooking_checkpoints")
      .select("object_path,expires_at")
      .eq("id", event.payload.checkpointId)
      .eq("session_id", event.session_id)
      .maybeSingle();
    if (checkpoint && new Date(checkpoint.expires_at).getTime() > Date.now()) {
      const { data } = await createAdminClient()
        .storage.from("recipe-inputs")
        .createSignedUrl(checkpoint.object_path, 5 * 60);
      if (data)
        return {
          ...event,
          payload: { ...event.payload, photoUrl: data.signedUrl },
        };
    }
    return event;
  }
  const photoUrl = event.payload.photoUrl;
  if (typeof photoUrl !== "string") return event;
  return {
    ...event,
    payload: {
      ...event.payload,
      photoUrl: await resolveMediaReference(supabase, photoUrl),
    },
  };
}
