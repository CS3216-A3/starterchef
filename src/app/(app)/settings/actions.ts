"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { safeActionFailure } from "@/lib/action-result";
import { profileInputSchema } from "@/lib/validation/actions";

export interface ProfileInput {
  displayName: string;
  dietaryRestrictions: string[];
  allergies: string[];
  skillLevel: "beginner" | "intermediate" | "advanced";
  householdSize: number;
}

/** Update the current user's profile row (created at signup by trigger). */
export async function updateProfile(input: ProfileInput) {
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
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return safeActionFailure("update your profile", error);
  revalidatePath("/settings");
  revalidatePath("/kitchen");
  return { ok: true };
}
