"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ProfileInput } from "@/app/(app)/settings/actions";
import { safeActionFailure } from "@/lib/action-result";
import { profileInputSchema } from "@/lib/validation/actions";

/**
 * Save the profile details collected during onboarding and mark the wizard
 * complete so the user isn't redirected again.
 */
export async function completeOnboarding(input: ProfileInput) {
  const parsed = profileInputSchema.safeParse(input);
  if (!parsed.success)
    return { error: "Check your profile values and try again" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const value = parsed.data;

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: value.displayName || null,
      dietary_restrictions: value.dietaryRestrictions,
      allergies: value.allergies,
      skill_level: value.skillLevel,
      household_size: value.householdSize,
      onboarded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return safeActionFailure("finish onboarding", error);
  revalidatePath("/today");
  return { ok: true };
}

/** Skip onboarding but still mark it complete (or resume later). */
export async function skipOnboarding() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error } = await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return safeActionFailure("skip onboarding", error);
  revalidatePath("/today");
  return { ok: true };
}
