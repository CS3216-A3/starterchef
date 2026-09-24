"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

/** History-aware back link for screens reached from several places. */
export function BackButton({ label = "Back" }: { label?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="inline-flex items-center gap-1.5 self-start text-sm font-bold text-espresso-light transition-colors hover:text-espresso"
    >
      <ArrowLeft className="h-4 w-4" /> {label}
    </button>
  );
}
