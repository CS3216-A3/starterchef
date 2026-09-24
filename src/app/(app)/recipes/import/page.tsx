"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FileImage, Link2, Sparkles, Type, Video } from "lucide-react";
import { getApiErrorMessage } from "@/lib/client-api-error";
import { Button } from "@/components/button";
import { RecipeDraftProgress } from "@/components/recipe-draft-progress";
import { createUserRecipe } from "@/app/(app)/recipes/actions";
import type { ImportedRecipe } from "@/lib/ai/schemas/import";

type Source = "text" | "url" | "photo" | "video";

interface ImportState {
  source: Source;
  text: string;
  url: string;
  photoDataUrl: string;
  photoInputId: string;
  videoUrl: string;
  videoDataUrl: string;
}

export default function ImportRecipePage() {
  const router = useRouter();
  const [state, setState] = useState<ImportState>({
    source: "text",
    text: "",
    url: "",
    photoDataUrl: "",
    photoInputId: "",
    videoUrl: "",
    videoDataUrl: "",
  });
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<
    (ImportedRecipe & { imageUrl?: string }) | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewDraftId, setReviewDraftId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // A durable draft can outlive a browser refresh. Keep the opaque ID in the
  // URL so "check back later" is an actual usable path, while the API still
  // performs the ownership check before revealing any review state.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const draftId = new URLSearchParams(window.location.search).get("draft");
      if (draftId) setReviewDraftId(draftId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!reviewDraftId) return;
    const url = new URL(window.location.href);
    url.searchParams.set("draft", reviewDraftId);
    window.history.replaceState(null, "", url);
  }, [reviewDraftId]);

  async function handleExtract(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setDraft(null);

    try {
      const draftRequest = buildDraftRequest(state);
      if (!draftRequest) {
        setError(
          state.source === "photo"
            ? "Choose and finish uploading a recipe image first."
            : "Paste a recipe source first.",
        );
        return;
      }
      const queued = await fetch("/api/recipe-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draftRequest,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (!queued.ok) {
        setError(
          await getApiErrorMessage(queued, "Could not queue recipe review"),
        );
        return;
      }
      const body = (await queued.json()) as {
        draftId?: string;
        resumedDraft?: boolean;
      };
      if (!body.draftId)
        setError("Recipe review was queued but could not be opened.");
      else {
        if (body.resumedDraft)
          setError(
            "You already have a recipe under review — accept or reject it, then start a new one.",
          );
        setReviewDraftId(body.draftId);
      }
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
    setError(null);
    setState((current) => ({
      ...current,
      photoInputId: "",
      photoDataUrl: "",
    }));
    const form = new FormData();
    form.set("image", file);
    setUploadProgress(0);
    try {
      const body = await uploadRecipeInput(form, setUploadProgress);
      const inputId = body.inputId;
      if (!inputId) throw new Error("Could not upload recipe image");
      setState((current) => ({
        ...current,
        photoInputId: inputId,
        photoDataUrl: "",
      }));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not upload recipe image",
      );
    } finally {
      setUploadProgress(null);
    }
  }

  function handleVideoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("Video imports are not available until a source is approved.");
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

      {reviewDraftId ? (
        <RecipeDraftProgress draftId={reviewDraftId} />
      ) : !draft ? (
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
            </div>
          )}

          {state.source === "photo" && (
            <div className="flex flex-col gap-4">
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoFile}
                disabled={uploadProgress !== null}
                className="rounded-2xl border-2 border-dashed border-espresso/20 bg-card p-4 text-sm font-semibold file:mr-4 file:rounded-full file:bg-flame file:px-4 file:py-2 file:text-white"
                required
              />
              {uploadProgress !== null && (
                <div className="flex flex-col gap-2" aria-live="polite">
                  <div className="flex items-center justify-between text-xs font-extrabold text-espresso-light">
                    <span>
                      {uploadProgress === 100
                        ? "Finishing secure upload…"
                        : "Uploading recipe image…"}
                    </span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-oat"
                    role="progressbar"
                    aria-label="Recipe image upload progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={uploadProgress}
                  >
                    <div
                      className="h-full rounded-full bg-flame transition-[width] duration-150"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
              {state.photoInputId && uploadProgress === null && (
                <p className="text-sm font-bold text-espresso-light">
                  Recipe image uploaded. You can now extract it.
                </p>
              )}
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
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm font-extrabold">
                  <Video className="h-4 w-4 text-flame" />
                  YouTube video link
                </label>
                <input
                  type="url"
                  value={state.videoUrl}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      videoUrl: e.target.value,
                      videoDataUrl: "",
                    }))
                  }
                  placeholder="https://www.youtube.com/watch?v=…"
                  className="rounded-2xl border-2 border-espresso/10 bg-card p-4 text-sm font-semibold outline-none focus:border-flame"
                />
                <p className="text-xs font-semibold text-espresso-light">
                  The video is extracted and verified before it can be saved.
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs font-extrabold text-espresso-light uppercase">
                <span className="h-px flex-1 bg-oat" />
                or
                <span className="h-px flex-1 bg-oat" />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-extrabold">
                  Upload a saved video (TikTok, Instagram, …)
                </label>
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleVideoFile}
                  className="rounded-2xl border-2 border-dashed border-espresso/20 bg-card p-4 text-sm font-semibold file:mr-4 file:rounded-full file:bg-flame file:px-4 file:py-2 file:text-white"
                />
                {state.videoDataUrl && (
                  <video
                    src={state.videoDataUrl}
                    controls
                    className="max-h-64 rounded-2xl"
                  />
                )}
                <p className="text-xs font-semibold text-espresso-light">
                  TikTok and Instagram links can&apos;t be read directly. Save
                  the video to your device and upload it here (max 20 MB).
                </p>
              </div>
            </div>
          )}

          <Button
            type="submit"
            disabled={
              loading ||
              uploadProgress !== null ||
              (state.source === "photo" && !state.photoInputId) ||
              (state.source === "video" && !state.videoUrl)
            }
            size="lg"
          >
            {loading ? "Reading recipe…" : "Extract recipe"}
            {!loading && <Sparkles className="h-4 w-4" />}
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

function uploadRecipeInput(
  form: FormData,
  onProgress: (progress: number) => void,
): Promise<{ inputId?: string }> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/recipe-inputs");
    request.responseType = "json";
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    request.onerror = () => reject(new Error("Could not upload recipe image"));
    request.onload = () => {
      const body = request.response as {
        inputId?: string;
        error?: { message?: string };
      } | null;
      if (request.status >= 200 && request.status < 300) {
        resolve(body ?? {});
        return;
      }
      reject(
        new Error(body?.error?.message ?? "Could not upload recipe image"),
      );
    };
    request.send(form);
  });
}

function SourceButton({
  active,
  onClick,
  icon,
  label,
  disabled = false,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-2 rounded-2xl p-3 text-xs font-extrabold transition-colors ${
        active && !disabled
          ? "bg-flame text-white"
          : "bg-card text-espresso-light ring-1 ring-oat hover:bg-oat disabled:cursor-not-allowed disabled:opacity-50"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function buildDraftRequest(
  state: ImportState,
):
  | { kind: "text"; content: string }
  | { kind: "url" | "youtube"; url: string }
  | { kind: "photo"; inputId: string }
  | null {
  switch (state.source) {
    case "text":
      return state.text.trim() ? { kind: "text", content: state.text } : null;
    case "url":
      return state.url.trim() ? { kind: "url", url: state.url } : null;
    case "photo":
      return state.photoInputId
        ? { kind: "photo", inputId: state.photoInputId }
        : null;
    case "video":
      return state.videoUrl.trim()
        ? { kind: "youtube", url: state.videoUrl }
        : null;
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
