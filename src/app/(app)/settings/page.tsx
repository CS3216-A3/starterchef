import type { Metadata } from "next";
import { ChefHat, Sparkles } from "lucide-react";
import { ProfileSettingsForm } from "@/components/profile-settings-form";
import { getAiUsageToday, getProfile } from "@/lib/data";

export const metadata: Metadata = {
  title: "Your profile",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [profile, usage] = await Promise.all([getProfile(), getAiUsageToday()]);
  const usedPct = Math.min(100, (usage.used / usage.limit) * 100);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-flame-soft text-flame">
          <ChefHat className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-3xl font-extrabold tracking-tight">
            {profile?.display_name || "Your profile"}
          </h1>
          <p className="mt-0.5 text-sm font-semibold text-espresso-light">
            Tell us about yourself so StarterChef can customise recipes for your
            needs.
          </p>
        </div>
      </div>

      <section className="flex flex-col gap-3 rounded-3xl bg-oat p-5">
        <div className="flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-sm font-extrabold">
            <Sparkles className="h-4 w-4 text-flame" /> AI credits today
          </h2>
          <span className="text-sm font-extrabold">
            {usage.limit - usage.used}{" "}
            <span className="font-semibold text-espresso-light">
              / {usage.limit} left
            </span>
          </span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-card"
          role="progressbar"
          aria-valuenow={usage.used}
          aria-valuemin={0}
          aria-valuemax={usage.limit}
        >
          <div
            className="h-full rounded-full bg-flame transition-all"
            style={{ width: `${usedPct}%` }}
          />
        </div>
        <p className="text-xs font-semibold text-espresso-light">
          Every feature marked with a{" "}
          <Sparkles className="inline h-3 w-3 text-flame" /> uses one credit.
          Credits reset daily at midnight UTC.
        </p>
      </section>

      <ProfileSettingsForm profile={profile} />
    </div>
  );
}
