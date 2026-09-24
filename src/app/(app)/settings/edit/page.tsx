import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProfileSettingsForm } from "@/components/profile-settings-form";
import { getProfile } from "@/lib/data";

export const metadata: Metadata = {
  title: "Edit profile",
};

export const dynamic = "force-dynamic";

export default async function EditProfilePage() {
  const profile = await getProfile();

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <Link
          href="/settings"
          className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-espresso-light hover:text-espresso"
        >
          <ArrowLeft className="h-4 w-4" /> Back to profile
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight">Edit profile</h1>
        <p className="mt-0.5 text-sm font-semibold text-espresso-light">
          Tell us about yourself so StarterChef can customise recipes for your
          needs.
        </p>
      </div>
      <ProfileSettingsForm profile={profile} />
    </div>
  );
}
