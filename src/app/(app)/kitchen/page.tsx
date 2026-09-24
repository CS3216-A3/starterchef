import Link from "next/link";
import type { Metadata } from "next";
import { AddKitchenItemForm } from "@/components/add-kitchen-item-form";
import { ScanKitchenButton } from "@/components/scan-kitchen-button";
import { VoiceAddItems } from "@/components/voice-add-items";
import { removeKitchenItem } from "@/app/(app)/kitchen/actions";
import { getKitchenItems, getProfile } from "@/lib/data";
import { kitchenIcon } from "@/lib/item-icons";

export const metadata: Metadata = {
  title: "My Kitchen",
};

export const dynamic = "force-dynamic";

export default async function KitchenPage() {
  const [kitchenItems, profile] = await Promise.all([
    getKitchenItems(),
    getProfile(),
  ]);

  const ingredients = kitchenItems.filter((i) => i.kind === "ingredient");
  const equipment = kitchenItems.filter((i) => i.kind === "equipment");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">My Kitchen</h1>
        <p className="mt-1 font-semibold text-espresso-light">
          What you have decides what we cook. Keep this list fresh: scan or edit
          after groceries.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <section className="rounded-3xl bg-card p-5 shadow-sm ring-1 ring-oat">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold">Ingredients</h2>
              <div className="flex items-center gap-3">
                <VoiceAddItems />
                <AddKitchenItemForm kind="ingredient" />
              </div>
            </div>
            {ingredients.length === 0 ? (
              <p className="text-sm font-semibold text-espresso-light">
                No ingredients yet. Scan your kitchen or add one above.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {ingredients.map((item) => {
                  const Icon = kitchenIcon(item);
                  return (
                    <li
                      key={item.id}
                      className="inline-flex items-center gap-2 rounded-full bg-oat px-4 py-2 text-sm font-bold"
                    >
                      <Icon className="h-4 w-4 text-espresso-light" />
                      {item.name}
                      {item.quantity ? (
                        <span className="text-xs font-semibold text-espresso-light">
                          · {item.quantity}
                        </span>
                      ) : null}
                      <RemoveItemForm id={item.id} />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-3xl bg-card p-5 shadow-sm ring-1 ring-oat">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-extrabold">Equipment</h2>
              <AddKitchenItemForm kind="equipment" />
            </div>
            {equipment.length === 0 ? (
              <p className="text-sm font-semibold text-espresso-light">
                No equipment listed yet.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {equipment.map((item) => {
                  const Icon = kitchenIcon(item);
                  return (
                    <li
                      key={item.id}
                      className="inline-flex items-center gap-2 rounded-full bg-oat px-4 py-2 text-sm font-bold"
                    >
                      <Icon className="h-4 w-4 text-espresso-light" />
                      {item.name}
                      <RemoveItemForm id={item.id} />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-3xl bg-card p-5 shadow-sm ring-1 ring-oat">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-extrabold">Your profile</h2>
              <Link
                href="/settings/edit"
                className="text-sm font-bold text-flame-ink hover:text-espresso"
              >
                Edit profile
              </Link>
            </div>
            <dl className="grid gap-3 text-sm font-semibold sm:grid-cols-2">
              <div>
                <dt className="text-espresso-light">Dietary needs</dt>
                <dd>
                  {profile && profile.dietary_restrictions.length > 0
                    ? profile.dietary_restrictions.join(", ")
                    : "None set"}
                </dd>
              </div>
              <div>
                <dt className="text-espresso-light">Allergies</dt>
                <dd>
                  {profile && profile.allergies.length > 0
                    ? profile.allergies.join(", ")
                    : "None set"}
                </dd>
              </div>
              <div>
                <dt className="text-espresso-light">Skill level</dt>
                <dd className="capitalize">
                  {profile?.skill_level ?? "Beginner"}
                </dd>
              </div>
              <div>
                <dt className="text-espresso-light">Household size</dt>
                <dd>{profile?.household_size ?? 2} people</dd>
              </div>
            </dl>
          </section>
        </div>

        <aside className="flex flex-col gap-4 rounded-3xl bg-oat p-5">
          <h2 className="text-lg font-extrabold">Scan my kitchen</h2>
          <p className="text-sm font-semibold text-espresso-light">
            Point your camera at your fridge or pantry. You confirm before
            anything is saved.
          </p>
          <ScanKitchenButton />
        </aside>
      </div>
    </div>
  );
}

function RemoveItemForm({ id }: { id: string }) {
  return (
    <form action={removeKitchenItem}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        aria-label="Remove"
        className="ml-1 text-espresso-light hover:text-flame-ink"
      >
        ×
      </button>
    </form>
  );
}
