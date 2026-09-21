import { CookingPot, Egg, ScanLine, Wheat } from "lucide-react";
import Link from "next/link";
import { ScanKitchenButton } from "@/components/scan-kitchen-button";
import type { KitchenItemRow } from "@/lib/types";

const ingredientIcons = [Egg, Wheat, CookingPot];

export function KitchenPanel({
  ingredients,
  equipment,
}: {
  ingredients: KitchenItemRow[];
  equipment: KitchenItemRow[];
}) {
  return (
    <aside className="flex flex-col gap-5 rounded-3xl bg-oat p-5">
      <h2 className="text-lg font-extrabold">In your kitchen</h2>

      {ingredients.length === 0 ? (
        <p className="text-sm font-semibold text-espresso-light">
          Nothing scanned yet — add ingredients so we can suggest meals.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {ingredients.map((item, i) => {
            const Icon = ingredientIcons[i % ingredientIcons.length];
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 text-sm font-bold"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-card">
                  <Icon className="h-4 w-4 text-espresso" />
                </span>
                {item.name}
                {item.quantity ? (
                  <span className="text-xs font-semibold text-espresso-light">
                    {item.quantity}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-t border-espresso/10 pt-4">
        <h3 className="mb-3 text-sm font-extrabold tracking-wide text-espresso-light uppercase">
          Your equipment
        </h3>
        {equipment.length === 0 ? (
          <p className="text-sm font-semibold text-espresso-light">
            No equipment listed yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {equipment.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 text-sm font-bold"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-card">
                  <CookingPot className="h-4 w-4 text-espresso" />
                </span>
                {item.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ScanKitchenButton />

      <Link
        href="/kitchen"
        className="text-center text-sm font-bold text-espresso-light underline underline-offset-2 hover:text-espresso"
      >
        Edit ingredients
      </Link>

      <p className="sr-only">
        <ScanLine className="h-4 w-4" /> Scan your kitchen to update this list.
      </p>
    </aside>
  );
}
