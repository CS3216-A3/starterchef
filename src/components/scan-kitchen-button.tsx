"use client";

import { Camera, ScanLine, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { saveKitchenItems } from "@/app/(app)/kitchen/actions";
import type { KitchenScanResult } from "@/lib/ai/schemas/kitchen-scan";

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
      setState({ status: "done", result: body as KitchenScanResult });
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
    const items = [
      ...result.ingredients.map((i) => ({
        kind: "ingredient" as const,
        name: i.name,
        quantity: i.estimatedQuantity ?? null,
        expiresOn: i.expiresWithinDays
          ? new Date(now.getTime() + i.expiresWithinDays * 86400000)
              .toISOString()
              .slice(0, 10)
          : null,
        source: "scan" as const,
      })),
      ...result.equipment.map((i) => ({
        kind: "equipment" as const,
        name: i.name,
        quantity: null as string | null,
        expiresOn: null as string | null,
        source: "scan" as const,
      })),
    ];
    const res = await saveKitchenItems(items);
    if (res.error) {
      setState({ status: "error", message: res.error });
    } else {
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
          <p className="mb-2 text-sm font-bold">
            Found {state.result.ingredients.length} ingredients and{" "}
            {state.result.equipment.length} tools.
          </p>
          <ul className="mb-3 flex flex-wrap gap-1 text-sm font-semibold text-espresso-light">
            {state.result.ingredients.map((i) => (
              <li key={i.name} className="rounded-full bg-oat px-2 py-0.5">
                {i.name}
              </li>
            ))}
            {state.result.equipment.map((i) => (
              <li key={i.name} className="rounded-full bg-oat px-2 py-0.5">
                {i.name}
              </li>
            ))}
          </ul>
          <p className="mb-3 text-xs font-semibold text-espresso-light">
            Existing items won&apos;t be removed — these will be merged in.
          </p>
          <Button
            type="button"
            className="w-full"
            onClick={() => addToKitchen(state.result)}
          >
            Add to my kitchen
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
