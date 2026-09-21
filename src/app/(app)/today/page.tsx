import { ArrowRight, Flame } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { FilterPills } from "@/components/filter-pills";
import { KitchenPanel } from "@/components/kitchen-panel";
import { RecipeCard } from "@/components/recipe-card";
import { mockRecipes } from "@/lib/mock-data";

export const metadata: Metadata = {
  title: "Today",
};

export default function TodayPage() {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            What can we cook today?
          </h1>
          <p className="mt-1 text-lg font-semibold text-espresso-light">
            Good food starts with what you have.
          </p>
        </div>
        <FilterPills />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold">A few ideas for tonight</h2>
            <Link
              href="/recipes"
              className="inline-flex items-center gap-1 text-sm font-bold text-espresso-light hover:text-espresso"
            >
              See more recipes <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {mockRecipes.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>

          <Link
            href="/cook/tomato-egg-stir-fry"
            className="flex items-center justify-between rounded-3xl bg-oat p-5 transition-colors hover:bg-oat-dark"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-card">
                <Flame className="h-5 w-5 text-flame" />
              </span>
              <span>
                <span className="block text-sm font-extrabold">
                  Already cooking?
                </span>
                <span className="block text-xs font-semibold text-espresso-light">
                  Continue from step 3
                </span>
              </span>
            </span>
            <ArrowRight className="h-5 w-5 text-espresso-light" />
          </Link>
        </section>

        <KitchenPanel />
      </div>
    </div>
  );
}
