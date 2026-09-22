import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { kitchenIcon } from "@/lib/item-icons";
import type { KitchenItemRow } from "@/lib/types";

/** Compact kitchen summary for the today page: ingredient/equipment pills
 *  and a single link to /kitchen where scan, voice and manual add live. */
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
          Nothing scanned yet. Add ingredients so we can suggest meals.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {ingredients.map((item) => {
            const Icon = kitchenIcon(item);
            return (
              <li
                key={item.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-bold"
              >
                <Icon className="h-3.5 w-3.5 text-espresso-light" />
                {item.name}
                {item.quantity ? (
                  <span className="font-semibold text-espresso-light">
                    · {item.quantity}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {equipment.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-extrabold tracking-wide text-espresso-light uppercase">
            Equipment
          </h3>
          <ul className="flex flex-wrap gap-2">
            {equipment.map((item) => {
              const Icon = kitchenIcon(item);
              return (
                <li
                  key={item.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-bold"
                >
                  <Icon className="h-3.5 w-3.5 text-espresso-light" />
                  {item.name}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Link
        href="/kitchen"
        className="inline-flex items-center justify-center gap-2 rounded-full bg-espresso px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-espresso-light"
      >
        Manage my kitchen <ArrowRight className="h-4 w-4" />
      </Link>
    </aside>
  );
}
