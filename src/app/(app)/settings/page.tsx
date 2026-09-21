import type { Metadata } from "next";
import { ProfileSettingsForm } from "@/components/profile-settings-form";
import { getProfile } from "@/lib/data";

export const metadata: Metadata = {
  title: "Settings",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const profile = await getProfile();

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>
        <p className="mt-1 font-semibold text-espresso-light">
          Tell us who&apos;s cooking — suggestions adapt to your diet,
          allergies, and skill level.
        </p>
      </div>
      <ProfileSettingsForm profile={profile} />
    </div>
  );
}
