"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Camera, CookingPot } from "lucide-react";
import { saveStepPhoto } from "@/app/(app)/cook/[id]/actions";

/**
 * Step image area on the cook screen. Shows the step's photo when one
 * exists; otherwise a compact placeholder plus an "Add a photo" button that
 * opens the camera on mobile. Uploaded photos persist on the recipe (owned)
 * or the session snapshot (catalogue).
 */
export function StepPhotoUpload({
  recipeId,
  recipeSlug,
  stepIndex,
  initialPhotoUrl,
}: {
  recipeId: string;
  recipeSlug: string;
  stepIndex: number;
  initialPhotoUrl?: string;
}) {
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    const formData = new FormData();
    formData.set("file", file);
    formData.set("recipeId", recipeId);
    formData.set("recipeSlug", recipeSlug);
    formData.set("stepIndex", String(stepIndex));

    startTransition(async () => {
      const result = await saveStepPhoto(formData);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      if ("photoUrl" in result) setPhotoUrl(result.photoUrl);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-video overflow-hidden rounded-3xl bg-gradient-to-br from-flame-soft to-oat">
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt={`Step ${stepIndex}`}
            fill
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <CookingPot
              className="h-14 w-14 text-espresso/25"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="inline-flex items-center gap-2 self-start text-sm font-bold text-espresso-light transition-colors hover:text-flame"
      >
        <Camera className="h-4 w-4" />
        {pending
          ? "Uploading…"
          : photoUrl
            ? "Replace photo of this step"
            : "Add a photo of this step"}
      </button>
      {error && <p className="text-xs font-bold text-red-700">{error}</p>}
    </div>
  );
}
