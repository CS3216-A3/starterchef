import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { getProfile, getUser } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const [user, profile] = await Promise.all([getUser(), getProfile()]);
  if (!user) redirect("/login");
  if (profile?.onboarded_at) redirect("/today");

  return (
    <main className="mx-auto flex min-h-full w-full max-w-5xl flex-1 flex-col px-4 py-8 sm:px-6">
      <OnboardingWizard profile={profile} />
    </main>
  );
}
