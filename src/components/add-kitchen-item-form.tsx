"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveKitchenItems } from "@/app/(app)/kitchen/actions";
import { trackEvent } from "@/lib/posthog/events";
import type { KitchenItemKind } from "@/lib/types";

export function AddKitchenItemForm({ kind }: { kind: KitchenItemKind }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim();
    if (!name) return;

    setError(null);
    startTransition(async () => {
      const result = await saveKitchenItems([
        { kind, name, source: "manual" },
      ]).catch(() => null);
      if (!result || !("count" in result)) {
        setError(
          result && "error" in result && result.error
            ? result.error
            : "Could not save this item",
        );
        return;
      }

      trackEvent("kitchen_items_saved", {
        source: "manual",
        item_count: result.count,
      });
      form.reset();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          name="name"
          type="text"
          placeholder={`Add ${kind}…`}
          required
          disabled={pending}
          className="rounded-full border border-oat-dark bg-cream px-3 py-1.5 text-sm font-semibold text-espresso focus:border-flame focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-espresso px-3 py-1.5 text-sm font-bold text-white hover:bg-espresso-light disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </form>
      {error ? (
        <p role="alert" className="text-xs font-bold text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
