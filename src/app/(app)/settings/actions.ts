"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ProfileInput {
  displayName: string;
  dietaryRestrictions: string[];
  allergies: string[];
  skillLevel: "beginner" | "intermediate" | "advanced";
  householdSize: number;
}

/** Update the current user's profile row (created at signup by trigger). */
export async function updateProfile(input: ProfileInput) {
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
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/settings");
  revalidatePath("/kitchen");
  return { ok: true };
}
