import { CookingPot, Egg, ScanLine, Wheat } from "lucide-react";
import Link from "next/link";
import { ScanKitchenButton } from "@/components/scan-kitchen-button";
import { mockEquipment, mockIngredients } from "@/lib/mock-data";

const ingredientIcons = [Egg, Wheat, CookingPot];

export function KitchenPanel() {
  return (
    <aside className="flex flex-col gap-5 rounded-3xl bg-oat p-5">
      <h2 className="text-lg font-extrabold">In your kitchen</h2>

      <ul className="flex flex-col gap-3">
        {mockIngredients.map((name, i) => {
          const Icon = ingredientIcons[i % ingredientIcons.length];
          return (
            <li
              key={name}
              className="flex items-center gap-3 text-sm font-bold"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-card">
                <Icon className="h-4 w-4 text-espresso" />
              </span>
              {name}
            </li>
          );
        })}
      </ul>

      <div className="border-t border-espresso/10 pt-4">
        <h3 className="mb-3 text-sm font-extrabold tracking-wide text-espresso-light uppercase">
          Your equipment
        </h3>
        <ul className="flex flex-col gap-3">
          {mockEquipment.map((name) => (
            <li
              key={name}
              className="flex items-center gap-3 text-sm font-bold"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-card">
                <CookingPot className="h-4 w-4 text-espresso" />
              </span>
              {name}
            </li>
          ))}
        </ul>
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
