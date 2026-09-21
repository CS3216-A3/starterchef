import { CookingPot, Egg, Wheat } from "lucide-react";
import type { Metadata } from "next";
import { ScanKitchenButton } from "@/components/scan-kitchen-button";
import { mockEquipment, mockIngredients } from "@/lib/mock-data";

export const metadata: Metadata = {
  title: "My Kitchen",
};

const ingredientIcons = [Egg, Wheat, CookingPot];

export default function KitchenPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">My Kitchen</h1>
        <p className="mt-1 font-semibold text-espresso-light">
          What you have decides what we cook. Keep this list fresh — scan or
          edit after groceries.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <section className="rounded-3xl bg-card p-5 shadow-sm ring-1 ring-oat">
            <h2 className="mb-4 text-lg font-extrabold">Ingredients</h2>
            <ul className="flex flex-wrap gap-2">
              {mockIngredients.map((name, i) => {
                const Icon = ingredientIcons[i % ingredientIcons.length];
                return (
                  <li
                    key={name}
                    className="inline-flex items-center gap-2 rounded-full bg-oat px-4 py-2 text-sm font-bold"
                  >
                    <Icon className="h-4 w-4 text-espresso-light" />
                    {name}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-3xl bg-card p-5 shadow-sm ring-1 ring-oat">
            <h2 className="mb-4 text-lg font-extrabold">Equipment</h2>
            <ul className="flex flex-wrap gap-2">
              {mockEquipment.map((name) => (
                <li
                  key={name}
                  className="inline-flex items-center gap-2 rounded-full bg-oat px-4 py-2 text-sm font-bold"
                >
                  <CookingPot className="h-4 w-4 text-espresso-light" />
                  {name}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-3xl bg-card p-5 shadow-sm ring-1 ring-oat">
            <h2 className="mb-4 text-lg font-extrabold">Your profile</h2>
            <dl className="grid gap-3 text-sm font-semibold sm:grid-cols-2">
              <div>
                <dt className="text-espresso-light">Dietary needs</dt>
                <dd>None set</dd>
              </div>
              <div>
                <dt className="text-espresso-light">Allergies</dt>
                <dd>None set</dd>
              </div>
              <div>
                <dt className="text-espresso-light">Skill level</dt>
                <dd>Beginner</dd>
              </div>
              <div>
                <dt className="text-espresso-light">Household size</dt>
                <dd>2 people</dd>
              </div>
            </dl>
          </section>
        </div>

        <aside className="flex flex-col gap-4 rounded-3xl bg-oat p-5">
          <h2 className="text-lg font-extrabold">Update with a photo</h2>
          <p className="text-sm font-semibold text-espresso-light">
            Take a photo of your fridge or pantry. StarterChef will recognise
            ingredients and tools and suggest updates — you confirm before
            anything is saved.
          </p>
          <ScanKitchenButton />
        </aside>
      </div>
    </div>
  );
}
