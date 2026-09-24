import type { Metadata } from "next";
import Link from "next/link";
import { ChefHat, History, Pencil, Sparkles } from "lucide-react";
import { CookingHistoryList } from "@/components/cooking-history-list";
import { getAiUsageToday, getCookingHistory, getProfile } from "@/lib/data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Your profile",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [profile, usage, history] = await Promise.all([
    getProfile(),
    getAiUsageToday(),
    getCookingHistory(),
  ]);
  const usedPct = Math.min(100, (usage.used / usage.limit) * 100);
  const skill = profile?.skill_level ?? "beginner";
  const household = profile?.household_size ?? 1;
  const diet = [
    ...(profile?.dietary_restrictions ?? []),
    ...(profile?.allergies ?? []).map((a) => `no ${a}`),
  ];

  const stats = [
    { label: "Dishes cooked", value: history.completedCount },
    { label: "Skill level", value: skill, capitalize: true },
    { label: "Cooking for", value: household },
  ];

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
          <p className="mt-0.5 text-sm font-semibold text-espresso-light capitalize">
            {skill} cook
          </p>
        </div>
        <Link
          href="/settings/edit"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-oat px-4 text-sm font-bold text-espresso transition-colors hover:bg-oat-dark"
        >
          <Pencil className="h-4 w-4" /> Edit profile
        </Link>
      </div>

      <dl className="grid grid-cols-3 gap-3">
        {stats.map(({ label, value, capitalize }) => (
          <div
            key={label}
            className="flex flex-col gap-1 rounded-3xl bg-card p-4 text-center ring-1 ring-oat"
          >
            <dd
              className={cn(
                "text-xl font-extrabold",
                capitalize && "capitalize",
              )}
            >
              {value}
            </dd>
            <dt className="order-last text-xs font-bold text-espresso-light">
              {label}
            </dt>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-2 rounded-3xl bg-card p-5 ring-1 ring-oat">
        <h2 className="text-sm font-extrabold">Diet & allergies</h2>
        {diet.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {diet.map((d) => (
              <li
                key={d}
                className="rounded-full bg-oat px-3 py-1 text-xs font-bold"
              >
                {d}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm font-semibold text-espresso-light">
            None set.{" "}
            <Link
              href="/settings/edit"
              className="font-bold text-flame hover:text-flame-dark"
            >
              Add them
            </Link>{" "}
            so recipes are tailored to you.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-xs font-extrabold tracking-wide text-espresso-light uppercase">
          <History className="h-4 w-4" /> Cooking history
        </h2>
        <CookingHistoryList sessions={history.sessions} />
      </section>

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
    </div>
  );
}
