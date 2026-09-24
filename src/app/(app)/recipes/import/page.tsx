"use client";

import { useEffect, useState } from "react";
import { FileImage, Link2, Sparkles, Type, Video } from "lucide-react";
import { getApiErrorMessage } from "@/lib/client-api-error";
import { loadActiveRecipeDraft } from "@/lib/active-recipe-draft";
import { Button } from "@/components/button";
import { RecipeDraftProgress } from "@/components/recipe-draft-progress";

type Source = "text" | "url" | "photo" | "video";

interface ImportState {
  source: Source;
  text: string;
  url: string;
  photoInputId: string;
  dishHint: string;
  videoUrl: string;
}

export default function ImportRecipePage() {
  const [state, setState] = useState<ImportState>({
    source: "text",
    text: "",
    url: "",
    photoInputId: "",
    dishHint: "",
    videoUrl: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewDraftId, setReviewDraftId] = useState<string | null>(null);
  const [resumedDraft, setResumedDraft] = useState(false);
  const [checkingActive, setCheckingActive] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // A durable draft can outlive a browser refresh. Keep the opaque ID in the
  // URL so "check back later" is an actual usable path, while the API still
  // performs the ownership check before revealing any review state.
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const draftId = new URLSearchParams(window.location.search).get("draft");
      if (draftId) {
        setReviewDraftId(draftId);
        setCheckingActive(false);
        return;
      }
      try {
        const active = await loadActiveRecipeDraft();
        if (cancelled) return;
        if (active) {
          setReviewDraftId(active.draftId);
          setResumedDraft(true);
        }
      } catch (cause) {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not find your active review",
          );
      } finally {
        if (!cancelled) setCheckingActive(false);
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
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
        if (queued.status === 409) {
          try {
            const active = await loadActiveRecipeDraft();
            if (active) {
              setReviewDraftId(active.draftId);
              setResumedDraft(true);
              return;
            }
          } catch {
            // Keep the original conflict message if discovery is unavailable.
          }
        }
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

  async function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setState((current) => ({
      ...current,
      photoInputId: "",
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

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Import a recipe
        </h1>
        <p className="mt-1 font-semibold text-espresso-light">
          Paste text, a link, a photo of a recipe card or finished dish, or a
          YouTube cooking video.
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

      {checkingActive ? (
        <p className="text-sm font-semibold text-espresso-light" role="status">
          Checking for an existing recipe review…
        </p>
      ) : reviewDraftId ? (
        <>
          {resumedDraft && (
            <p className="rounded-2xl bg-oat p-4 text-sm font-semibold text-espresso">
              You already have a recipe review underway. Finish or cancel it
              before starting another import.
            </p>
          )}
          <RecipeDraftProgress
            draftId={reviewDraftId}
            onStartOver={() => {
              const url = new URL(window.location.href);
              url.searchParams.delete("draft");
              window.history.replaceState(null, "", url);
              setReviewDraftId(null);
              setResumedDraft(false);
              setError(null);
            }}
          />
        </>
      ) : (
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
              <label className="flex flex-col gap-2 text-sm font-extrabold">
                Dish name (optional)
                <input
                  type="text"
                  value={state.dishHint}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      dishHint: event.target.value,
                    }))
                  }
                  maxLength={120}
                  placeholder="e.g. chicken curry with rice"
                  className="rounded-2xl border-2 border-espresso/10 bg-card p-3 text-sm font-semibold outline-none focus:border-flame"
                />
              </label>
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
                  Photo uploaded. You can now build a recipe.
                </p>
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
                    setState((s) => ({ ...s, videoUrl: e.target.value }))
                  }
                  placeholder="https://www.youtube.com/watch?v=…"
                  className="rounded-2xl border-2 border-espresso/10 bg-card p-4 text-sm font-semibold outline-none focus:border-flame"
                />
                <p className="text-xs font-semibold text-espresso-light">
                  The video is extracted and verified before it can be saved.
                </p>
              </div>

              <p className="text-xs font-semibold text-espresso-light">
                Only public YouTube links are supported for video import.
              </p>
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
            {loading ? "Building recipe…" : "Build recipe"}
            {!loading && <Sparkles className="h-4 w-4" />}
          </Button>

          {error && (
            <p
              role="alert"
              className="rounded-2xl bg-oat p-3 text-sm font-bold text-flame"
            >
              {error}
            </p>
          )}
        </form>
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
  | { kind: "photo"; inputId: string; dishHint?: string }
  | null {
  switch (state.source) {
    case "text":
      return state.text.trim() ? { kind: "text", content: state.text } : null;
    case "url":
      return state.url.trim() ? { kind: "url", url: state.url } : null;
    case "photo":
      return state.photoInputId
        ? {
            kind: "photo",
            inputId: state.photoInputId,
            ...(state.dishHint.trim()
              ? { dishHint: state.dishHint.trim() }
              : {}),
          }
        : null;
    case "video":
      return state.videoUrl.trim()
        ? { kind: "youtube", url: state.videoUrl }
        : null;
  }
}
