"use client";

import { Camera, CircleAlert, ScanLine, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { getApiErrorMessage } from "@/lib/client-api-error";
import type { KitchenScanCandidate } from "@/lib/types";
import { trackEvent } from "@/lib/posthog/events";

type ScanState =
  | { status: "idle" }
  | { status: "preview" }
  | { status: "scanning" }
  | {
      status: "done";
      scanId: string;
      candidates: KitchenScanCandidate[];
      error?: string;
    }
  | { status: "saving" }
  | { status: "saved"; added: number }
  | { status: "error"; message: string };

export function ScanKitchenButton() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const [state, setState] = useState<ScanState>({ status: "idle" });

  async function startCamera() {
    setState({ status: "preview" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setState({
        status: "error",
        message:
          "Could not access camera. Allow camera permission and try again.",
      });
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob)
          return setState({
            status: "error",
            message: "Could not capture photo. Try again.",
          });
        stopCamera();
        void scanImage(new File([blob], "kitchen.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.85,
    );
  }

  async function scanImage(image: File) {
    setState({ status: "scanning" });
    try {
      const form = new FormData();
      form.set("image", image);
      const stored = window.sessionStorage.getItem(
        "starterchef:kitchen-scan-key",
      );
      const idempotencyKey =
        idempotencyKeyRef.current ?? stored ?? crypto.randomUUID();
      idempotencyKeyRef.current = idempotencyKey;
      window.sessionStorage.setItem(
        "starterchef:kitchen-scan-key",
        idempotencyKey,
      );
      form.set("idempotencyKey", idempotencyKey);
      const res = await fetch("/api/kitchen-scans", {
        method: "POST",
        body: form,
      });
      if (!res.ok)
        throw new Error(await getApiErrorMessage(res, "Scan failed"));
      const body = (await res.json()) as {
        id?: string;
        candidates?: KitchenScanCandidate[];
        status?: string;
      };
      if (!body.id || !Array.isArray(body.candidates))
        throw new Error("Scan failed");
      setState({
        status: "done",
        scanId: body.id,
        candidates: body.candidates,
      });
      // Confident matches come pre-checked; low-confidence items are left
      // for the cook to confirm before they are added.
      setSelected(
        new Set(
          body.candidates
            .filter((candidate) => candidate.confidence !== "low")
            .map((candidate) => candidate.id),
        ),
      );
      trackEvent("kitchen_scan_completed", {
        ingredient_count: body.candidates.filter(
          (candidate) => candidate.kind === "ingredient",
        ).length,
        equipment_count: body.candidates.filter(
          (candidate) => candidate.kind === "equipment",
        ).length,
        uncertain_count: body.candidates.filter(
          (candidate) => candidate.confidence === "low",
        ).length,
      });
      if (body.status && body.status !== "processing") {
        window.sessionStorage.removeItem("starterchef:kitchen-scan-key");
        idempotencyKeyRef.current = null;
      }
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Scan failed",
      });
    }
  }

  async function addToKitchen(
    scanId: string,
    candidates: KitchenScanCandidate[],
  ) {
    const accepted = candidates
      .filter((candidate) => selected.has(candidate.id))
      .map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        quantity: candidate.quantity,
        expiresOn: candidate.expiresOn,
      }));
    if (accepted.length === 0) return;
    setState({ status: "saving" });
    try {
      const res = await fetch(`/api/kitchen-scans/${scanId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accepted),
      });
      if (!res.ok)
        throw new Error(
          await getApiErrorMessage(res, "Could not add detected items"),
        );
      const body = (await res.json()) as { items?: unknown[] };
      const added = body.items?.length ?? accepted.length;

      trackEvent("kitchen_items_saved", {
        source: "scan",
        item_count: added,
      });

      setState({
        status: "saved",
        added,
      });
      window.sessionStorage.removeItem("starterchef:kitchen-scan-key");
      idempotencyKeyRef.current = null;
      window.location.reload();
    } catch (error) {
      setState({
        status: "done",
        scanId,
        candidates,
        error:
          error instanceof Error
            ? error.message
            : "Could not add detected items",
      });
    }
  }

  const [selected, setSelected] = useState<Set<string>>(new Set());

  function closePreview() {
    stopCamera();
    setState({ status: "idle" });
  }

  useEffect(() => {
    return () => stopCamera();
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {state.status === "preview" && (
        <div className="relative overflow-hidden rounded-3xl bg-card shadow-sm ring-1 ring-oat">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="aspect-video w-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />
          <button
            type="button"
            onClick={closePreview}
            className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur"
            aria-label="Close camera"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="absolute right-0 bottom-0 left-0 flex justify-center p-4">
            <Button
              type="button"
              size="lg"
              onClick={capture}
              className="shadow-lg"
            >
              <Camera className="h-5 w-5" /> Capture
            </Button>
          </div>
        </div>
      )}

      {state.status === "done" && (
        <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-oat">
          <p className="mb-2 text-sm font-bold" role="status">
            We found {state.candidates.length} possible items
            {state.candidates.some((item) => item.confidence === "low")
              ? ` — ${state.candidates.filter((item) => item.confidence === "low").length} to check`
              : ""}
            . Select what to add.
          </p>
          {state.candidates.some((item) => item.confidence === "low") && (
            <p className="mb-3 text-sm font-semibold text-espresso-light">
              AI can misidentify items. Anything marked “Check this item” is
              left unchecked. Review its name and amount before selecting it.
            </p>
          )}
          {state.candidates.length === 0 && (
            <p className="mb-3 text-sm font-semibold text-espresso-light">
              No items detected. Try a clearer photo with better lighting, or
              add your items manually.
            </p>
          )}
          <ul className="mb-3 flex flex-col gap-2 text-sm font-semibold text-espresso-light">
            {state.candidates.map((item) => (
              <li
                key={item.id}
                className={`flex flex-wrap items-center gap-2 rounded-xl p-3 ${
                  item.confidence === "low" ? "bg-flame-soft" : "bg-oat"
                }`}
              >
                {item.confidence === "low" && (
                  <span
                    id={`confidence-${item.id}`}
                    className="flex w-full items-center gap-1.5 text-xs font-extrabold text-flame-ink"
                  >
                    <CircleAlert
                      className="h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    Check this item · low AI confidence
                  </span>
                )}
                <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg focus-within:ring-2 focus-within:ring-flame">
                  <input
                    aria-label={`Select ${item.name}`}
                    aria-describedby={
                      item.confidence === "low"
                        ? `confidence-${item.id}`
                        : undefined
                    }
                    type="checkbox"
                    className="h-5 w-5 accent-flame"
                    checked={selected.has(item.id)}
                    onChange={() =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      })
                    }
                  />
                </label>
                <input
                  aria-label={`${item.name} name`}
                  className="h-10 min-w-0 flex-1 basis-28 rounded-lg bg-transparent px-1 font-semibold focus:outline-flame"
                  value={item.name}
                  onChange={(event) =>
                    setState((current) =>
                      current.status === "done"
                        ? {
                            ...current,
                            candidates: current.candidates.map((candidate) =>
                              candidate.id === item.id
                                ? { ...candidate, name: event.target.value }
                                : candidate,
                            ),
                          }
                        : current,
                    )
                  }
                />
                {item.kind === "ingredient" ? (
                  <input
                    aria-label={`${item.name} quantity`}
                    className="h-10 w-20 rounded-lg bg-transparent px-1 text-xs focus:outline-flame"
                    placeholder="amount"
                    value={item.quantity ?? ""}
                    onChange={(event) =>
                      setState((current) =>
                        current.status === "done"
                          ? {
                              ...current,
                              candidates: current.candidates.map((candidate) =>
                                candidate.id === item.id
                                  ? {
                                      ...candidate,
                                      quantity: event.target.value || null,
                                    }
                                  : candidate,
                              ),
                            }
                          : current,
                      )
                    }
                  />
                ) : null}
                {item.kind === "ingredient" ? (
                  <input
                    aria-label={`${item.name} expiry`}
                    className="h-10 w-32 rounded-lg bg-transparent px-1 text-xs focus:outline-flame"
                    type="date"
                    value={item.expiresOn ?? ""}
                    onChange={(event) =>
                      setState((current) =>
                        current.status === "done"
                          ? {
                              ...current,
                              candidates: current.candidates.map((candidate) =>
                                candidate.id === item.id
                                  ? {
                                      ...candidate,
                                      expiresOn: event.target.value || null,
                                    }
                                  : candidate,
                              ),
                            }
                          : current,
                      )
                    }
                  />
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mb-3 text-xs font-semibold text-espresso-light">
            {selected.size} selected. Only selected items will be added.
            Existing items won&apos;t be removed.
          </p>
          {state.error && (
            <p role="alert" className="mb-3 text-sm font-bold text-flame-ink">
              {state.error}
            </p>
          )}
          <Button
            type="button"
            className="w-full"
            disabled={selected.size === 0}
            onClick={() => addToKitchen(state.scanId, state.candidates)}
          >
            Add to my kitchen
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="mt-2 w-full"
            onClick={() => setState({ status: "idle" })}
          >
            Discard scan
          </Button>
        </div>
      )}

      {state.status === "saved" && (
        <div className="rounded-2xl bg-green-50 p-3 text-sm font-semibold text-green-700 ring-1 ring-green-100">
          Added {state.added} item(s) to your kitchen. Visit the Kitchen page to
          review.
        </div>
      )}

      {state.status === "saving" && (
        <p className="text-sm font-semibold text-espresso-light">Saving…</p>
      )}

      {state.status !== "preview" &&
        state.status !== "done" &&
        state.status !== "saving" && (
          <Button
            size="md"
            className="w-full"
            disabled={state.status === "scanning"}
            onClick={startCamera}
          >
            <ScanLine className="h-5 w-5" />
            {state.status === "scanning" ? "Scanning…" : "Scan my kitchen"}
            {state.status !== "scanning" && <Sparkles className="h-4 w-4" />}
          </Button>
        )}

      {state.status === "error" && (
        <div className="rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700 ring-1 ring-red-100">
          {state.message}
        </div>
      )}
    </div>
  );
}
