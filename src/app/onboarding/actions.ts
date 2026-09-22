"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ProfileInput } from "@/app/(app)/settings/actions";

/**
 * Save the profile details collected during onboarding and mark the wizard
 * complete so the user isn't redirected again.
 */
export async function completeOnboarding(input: ProfileInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const skillLevel = ["beginner", "intermediate", "advanced"].includes(
    input.skillLevel,
  )
    ? input.skillLevel
    : "beginner";
  const householdSize = Math.max(
    1,
    Math.min(20, Math.floor(input.householdSize) || 1),
  );

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: input.displayName.trim() || null,
      dietary_restrictions: input.dietaryRestrictions,
      allergies: input.allergies
        .map((a) => a.trim())
        .filter((a) => a.length > 0),
      skill_level: skillLevel,
      household_size: householdSize,
      onboarded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: error.message };
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

  await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", user.id);
  revalidatePath("/today");
  return { ok: true };
}
