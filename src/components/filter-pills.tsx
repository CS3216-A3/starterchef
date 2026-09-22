"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChefHat, ChevronDown, Clock, Users } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Time / servings / skill filters for the ideas list on /today. Selections
 * are written to the URL (?time=&servings=&skill=) so the server component
 * can filter and the state survives reloads/shares.
 */

const filters = [
  {
    key: "time",
    icon: Clock,
    label: (v: string | null) => (v ? `${v} minutes` : "Any time"),
    options: [
      { value: "", label: "Any time" },
      { value: "15", label: "15 minutes" },
      { value: "20", label: "20 minutes" },
      { value: "30", label: "30 minutes" },
      { value: "45", label: "45 minutes" },
    ],
  },
  {
    key: "servings",
    icon: Users,
    label: (v: string | null) => (v ? `${v} people` : "Any servings"),
    options: [
      { value: "", label: "Any servings" },
      { value: "1", label: "1 person" },
      { value: "2", label: "2 people" },
      { value: "4", label: "4 people" },
    ],
  },
  {
    key: "skill",
    icon: ChefHat,
    label: (v: string | null) =>
      v ? v.charAt(0).toUpperCase() + v.slice(1) : "Any level",
    options: [
      { value: "", label: "Any level" },
      { value: "beginner", label: "Beginner" },
      { value: "intermediate", label: "Intermediate" },
      { value: "advanced", label: "Advanced" },
    ],
  },
] as const;

export function FilterPills() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpenKey(null);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function select(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    setOpenKey(null);
    router.push(`?${params.toString()}`);
  }

  return (
    <div ref={containerRef} className="flex flex-wrap gap-2">
      {filters.map(({ key, icon: Icon, label, options }) => {
        const current = searchParams.get(key);
        const active = Boolean(current);
        return (
          <div key={key} className="relative">
            <button
              type="button"
              onClick={() => setOpenKey(openKey === key ? null : key)}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold shadow-sm ring-1 transition-colors",
                active
                  ? "bg-flame text-white ring-flame"
                  : "bg-card text-espresso ring-oat hover:ring-flame/50",
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4",
                  active ? "text-white" : "text-espresso-light",
                )}
              />
              {label(current)}
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5",
                  active ? "text-white" : "text-espresso-light",
                )}
              />
            </button>
            {openKey === key && (
              <div className="absolute z-20 mt-2 w-44 overflow-hidden rounded-2xl bg-card py-1 shadow-lg ring-1 ring-oat">
                {options.map((opt) => (
                  <button
                    key={opt.value || "any"}
                    type="button"
                    onClick={() => select(key, opt.value)}
                    className={cn(
                      "block w-full px-4 py-2 text-left text-sm font-bold transition-colors hover:bg-oat",
                      (current ?? "") === opt.value
                        ? "text-flame"
                        : "text-espresso",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
