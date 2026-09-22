"use client";

import { Camera, CircleAlert, ScanLine, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/button";
import { saveKitchenItems } from "@/app/(app)/kitchen/actions";
import { trackEvent } from "@/lib/posthog/events";
import type { KitchenScanResult } from "@/lib/ai/schemas/kitchen-scan";
import type { KitchenIconKey } from "@/lib/item-icons";

type ScannedItem = {
  key: string;
  kind: "ingredient" | "equipment";
  name: string;
  confidence: "high" | "medium" | "low";
  estimatedQuantity?: string;
  expiresWithinDays?: number;
  icon: KitchenIconKey;
};

function flattenItems(result: KitchenScanResult): ScannedItem[] {
  return [
    ...result.ingredients.map((i) => ({
      key: `ingredient:${i.name}`,
      kind: "ingredient" as const,
      name: i.name,
      confidence: i.confidence,
      estimatedQuantity: i.estimatedQuantity,
      expiresWithinDays: i.expiresWithinDays,
      icon: i.icon,
    })),
    ...result.equipment.map((i) => ({
      key: `equipment:${i.name}`,
      kind: "equipment" as const,
      name: i.name,
      confidence: i.confidence,
      icon: i.icon,
    })),
  ];
}

type ScanState =
  | { status: "idle" }
  | { status: "preview" }
  | { status: "scanning" }
  | { status: "done"; result: KitchenScanResult }
  | { status: "saving" }
  | { status: "saved"; added: number }
  | { status: "error"; message: string };

export function ScanKitchenButton() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<ScanState>({ status: "idle" });
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const items = useMemo(
    () => (state.status === "done" ? flattenItems(state.result) : []),
    [state],
  );
  const confidentItems = items.filter((i) => i.confidence !== "low");
  const uncertainItems = items.filter((i) => i.confidence === "low");

  function toggleExcluded(key: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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

    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    stopCamera();
    void scanImage(dataUrl);
  }

  async function scanImage(dataUrl: string) {
    setState({ status: "scanning" });
    try {
      const res = await fetch("/api/ai/kitchen-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Scan failed");
      const result = body as KitchenScanResult;
      setExcluded(
        new Set(
          flattenItems(result)
            .filter((i) => i.confidence === "low")
            .map((i) => i.key),
        ),
      );
      trackEvent("kitchen_scan_completed", {
        ingredient_count: result.ingredients.length,
        equipment_count: result.equipment.length,
        uncertain_count:
          result.ingredients.filter((i) => i.confidence === "low").length +
          result.equipment.filter((i) => i.confidence === "low").length,
      });
      setState({ status: "done", result });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Scan failed",
      });
    }
  }

  async function addToKitchen(result: KitchenScanResult) {
    setState({ status: "saving" });
    const now = new Date();
    const confirmed = flattenItems(result).filter((i) => !excluded.has(i.key));
    const items = confirmed.map((i) => ({
      kind: i.kind,
      name: i.name,
      quantity: i.estimatedQuantity ?? null,
      expiresOn: i.expiresWithinDays
        ? new Date(now.getTime() + i.expiresWithinDays * 86400000)
            .toISOString()
            .slice(0, 10)
        : null,
      icon: i.icon,
      source: "scan" as const,
    }));
    const res = await saveKitchenItems(items);
    if (res.error) {
      setState({ status: "error", message: res.error });
    } else {
      trackEvent("kitchen_scan_confirmed", {
        items_saved: res.count ?? items.length,
        items_excluded: excluded.size,
      });
      setState({ status: "saved", added: res.count ?? items.length });
    }
  }

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
          <p className="mb-3 text-sm font-bold">
            Found {confidentItems.length} confident match
            {confidentItems.length === 1 ? "" : "es"}
            {uncertainItems.length > 0 && `, ${uncertainItems.length} to check`}
            .
          </p>

          {confidentItems.length > 0 && (
            <ul className="mb-3 flex flex-wrap gap-1 text-sm font-semibold text-espresso-light">
              {confidentItems.map((i) => (
                <li key={i.key} className="rounded-full bg-oat px-2 py-0.5">
                  {i.name}
                </li>
              ))}
            </ul>
          )}

          {uncertainItems.length > 0 && (
            <div className="mb-3 flex flex-col gap-2">
              <p className="flex items-center gap-1.5 text-xs font-bold text-espresso-light">
                <CircleAlert className="h-3.5 w-3.5 text-flame" />
                Low confidence — check before adding
              </p>
              <ul className="flex flex-col gap-1.5">
                {uncertainItems.map((i) => (
                  <li key={i.key}>
                    <label className="flex items-center gap-2 rounded-xl bg-flame-soft px-3 py-2 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={!excluded.has(i.key)}
                        onChange={() => toggleExcluded(i.key)}
                        className="h-4 w-4 accent-flame"
                      />
                      {i.name}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mb-3 text-xs font-semibold text-espresso-light">
            Existing items won&apos;t be removed. These will be merged in.
          </p>
          <Button
            type="button"
            className="w-full"
            onClick={() => addToKitchen(state.result)}
            disabled={items.length - excluded.size === 0}
          >
            Add {items.length - excluded.size} item
            {items.length - excluded.size === 1 ? "" : "s"}
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
