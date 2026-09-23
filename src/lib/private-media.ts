import type { createClient } from "@/lib/supabase/server";
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
