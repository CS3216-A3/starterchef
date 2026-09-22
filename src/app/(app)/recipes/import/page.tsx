"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FileImage, Link2, Type, Video } from "lucide-react";
import { Button } from "@/components/button";
import { createUserRecipe } from "@/app/(app)/recipes/actions";
import type { ImportedRecipe } from "@/lib/ai/schemas/import";

type Source = "text" | "url" | "photo" | "video";

interface ImportState {
  source: Source;
  text: string;
  url: string;
  htmlFallback: string;
  photoDataUrl: string;
  videoUrl: string;
}

export default function ImportRecipePage() {
  const router = useRouter();
  const [state, setState] = useState<ImportState>({
    source: "text",
    text: "",
    url: "",
    htmlFallback: "",
    photoDataUrl: "",
    videoUrl: "",
  });
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<
    (ImportedRecipe & { imageUrl?: string }) | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExtract(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setDraft(null);

    try {
      const body = buildRequestBody(state);
      const res = await fetch("/api/ai/import-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as
        (ImportedRecipe & { imageUrl?: string }) | { error: string };
      if (!res.ok) {
        setError("error" in data ? data.error : "Import failed");
        return;
      }
      setDraft(data as ImportedRecipe & { imageUrl?: string });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!draft) return;
    setLoading(true);
    const result = await createUserRecipe({
      ...draft,
      source: sourceLabel(state.source),
      sourceUrl: state.url || state.videoUrl || undefined,
      imageUrl: draft.imageUrl,
    });
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    router.push(`/recipes`);
  }

  async function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setState((s) => ({ ...s, photoDataUrl: reader.result as string }));
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Import a recipe
        </h1>
        <p className="mt-1 font-semibold text-espresso-light">
          Paste text, a link, a photo of a recipe card, or a YouTube cooking
          video.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <SourceButton
          active={state.source === "text"}
          onClick={() => setState((s) => ({ ...s, source: "text" }))}
          icon={<Type className="h-4 w-4" />}
          label="Text"
        />
        <SourceButton
          active={state.source === "url"}
          onClick={() => setState((s) => ({ ...s, source: "url" }))}
          icon={<Link2 className="h-4 w-4" />}
          label="Link"
        />
        <SourceButton
          active={state.source === "photo"}
          onClick={() => setState((s) => ({ ...s, source: "photo" }))}
          icon={<FileImage className="h-4 w-4" />}
          label="Photo"
        />
        <SourceButton
          active={state.source === "video"}
          onClick={() => setState((s) => ({ ...s, source: "video" }))}
          icon={<Video className="h-4 w-4" />}
          label="YouTube"
        />
      </div>

      {!draft ? (
        <form onSubmit={handleExtract} className="flex flex-col gap-4">
          {state.source === "text" && (
            <textarea
              value={state.text}
              onChange={(e) =>
                setState((s) => ({ ...s, text: e.target.value }))
              }
              placeholder="Paste the full recipe text here..."
              rows={12}
              className="rounded-2xl border-2 border-espresso/10 bg-card p-4 text-sm font-semibold outline-none focus:border-flame"
              required
            />
          )}

          {state.source === "url" && (
            <div className="flex flex-col gap-4">
              <input
                type="url"
                value={state.url}
                onChange={(e) =>
                  setState((s) => ({ ...s, url: e.target.value }))
                }
                placeholder="https://example.com/recipe"
                className="rounded-2xl border-2 border-espresso/10 bg-card p-4 text-sm font-semibold outline-none focus:border-flame"
                required
              />
              <details className="text-sm">
                <summary className="cursor-pointer font-bold text-espresso-light">
                  Site blocks fetching? Paste page HTML
                </summary>
                <textarea
                  value={state.htmlFallback}
                  onChange={(e) =>
                    setState((s) => ({ ...s, htmlFallback: e.target.value }))
                  }
                  placeholder="Paste the page source HTML here..."
                  rows={6}
                  className="mt-2 w-full rounded-2xl border-2 border-espresso/10 bg-card p-4 text-sm font-semibold outline-none focus:border-flame"
                />
              </details>
            </div>
          )}

          {state.source === "photo" && (
            <div className="flex flex-col gap-4">
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoFile}
                className="rounded-2xl border-2 border-dashed border-espresso/20 bg-card p-4 text-sm font-semibold file:mr-4 file:rounded-full file:bg-flame file:px-4 file:py-2 file:text-white"
                required
              />
              {state.photoDataUrl && (
                <Image
                  src={state.photoDataUrl}
                  alt="Recipe preview"
                  width={400}
                  height={256}
                  unoptimized
                  className="max-h-64 rounded-2xl object-contain"
                />
              )}
            </div>
          )}

          {state.source === "video" && (
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm font-extrabold">
                <Video className="h-4 w-4 text-flame" />
                YouTube video link
              </label>
              <input
                type="url"
                value={state.videoUrl}
                onChange={(e) =>
                  setState((s) => ({ ...s, videoUrl: e.target.value }))
                }
                placeholder="https://www.youtube.com/watch?v=…"
                className="rounded-2xl border-2 border-espresso/10 bg-card p-4 text-sm font-semibold outline-none focus:border-flame"
                required
              />
              <p className="text-xs font-semibold text-espresso-light">
                YouTube links only — paste a public YouTube cooking video
                (youtube.com or youtu.be). Other video sites and file uploads
                aren&apos;t supported yet.
              </p>
            </div>
          )}

          <Button type="submit" disabled={loading} size="lg">
            {loading ? "Reading recipe…" : "Extract recipe"}
          </Button>

          {error && (
            <p className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">
              {error}
            </p>
          )}
        </form>
      ) : (
        <div className="flex flex-col gap-6 rounded-3xl bg-card p-6 shadow-sm ring-1 ring-oat">
          {draft.imageUrl && (
            <div className="relative aspect-[16/9] overflow-hidden rounded-2xl">
              <Image
                src={draft.imageUrl}
                alt={draft.title}
                fill
                unoptimized
                className="object-cover"
              />
            </div>
          )}
          <div>
            <h2 className="text-xl font-extrabold">{draft.title}</h2>
            <p className="text-sm font-semibold text-espresso-light">
              {draft.minutes} min · {draft.difficulty} · Serves {draft.servings}
            </p>
          </div>

          <section>
            <h3 className="text-xs font-extrabold tracking-wide text-espresso-light uppercase">
              Ingredients
            </h3>
            <ul className="mt-2 grid gap-1 text-sm font-semibold">
              {draft.ingredients.map((ing) => (
                <li key={ing}>{ing}</li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-xs font-extrabold tracking-wide text-espresso-light uppercase">
              Steps
            </h3>
            <ol className="mt-2 flex flex-col gap-3">
              {draft.steps.map((step) => (
                <li key={step.index} className="text-sm font-semibold">
                  <span className="font-extrabold text-flame">
                    {step.index}.
                  </span>{" "}
                  {step.title}
                  <p className="mt-1 font-semibold text-espresso-light">
                    {step.instruction}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setDraft(null)}
              disabled={loading}
            >
              Try again
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={loading}>
              {loading ? "Saving…" : "Save to my recipes"}
            </Button>
          </div>

          {error && (
            <p className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SourceButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-2 rounded-2xl p-3 text-xs font-extrabold transition-colors ${
        active
          ? "bg-flame text-white"
          : "bg-card text-espresso-light ring-1 ring-oat hover:bg-oat"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function buildRequestBody(state: ImportState): unknown {
  switch (state.source) {
    case "text":
      return { source: "text", content: state.text };
    case "url":
      return {
        source: "url",
        url: state.url,
        ...(state.htmlFallback ? { html: state.htmlFallback } : {}),
      };
    case "photo":
      return { source: "photo", image: state.photoDataUrl };
    case "video":
      return { source: "video", url: state.videoUrl };
  }
}

function sourceLabel(source: Source): string {
  switch (source) {
    case "text":
      return "pasted-text";
    case "url":
      return "url";
    case "photo":
      return "photo";
    case "video":
      return "youtube";
  }
}
