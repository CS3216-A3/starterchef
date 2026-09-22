import type { Metadata } from "next";
import { ChefHat } from "lucide-react";
import { ProfileSettingsForm } from "@/components/profile-settings-form";
import { SignOutButton } from "@/components/sign-out-button";
import { getProfile } from "@/lib/data";

export const metadata: Metadata = {
  title: "Your profile",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const profile = await getProfile();
  const initial = profile?.display_name?.trim().charAt(0).toUpperCase();

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-flame-soft text-2xl font-extrabold text-flame">
          {initial ?? <ChefHat className="h-7 w-7" />}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-3xl font-extrabold tracking-tight">
            {profile?.display_name || "Your profile"}
          </h1>
          <p className="mt-0.5 text-sm font-semibold text-espresso-light">
            StarterChef personalises recipes and guidance from this.
          </p>
        </div>
      </div>

      <ProfileSettingsForm profile={profile} />

      <div className="flex justify-center border-t border-oat pt-6">
        <SignOutButton />
      </div>
    </div>
  );
}
