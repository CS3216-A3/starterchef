"use client";

import { Camera, ScanLine, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import type { KitchenScanResult } from "@/lib/ai/schemas/kitchen-scan";

type ScanState =
  | { status: "idle" }
  | { status: "preview" }
  | { status: "scanning" }
  | { status: "done"; result: KitchenScanResult }
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

      {state.status !== "preview" && (
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

      {state.status === "done" && (
        <div className="rounded-2xl bg-green-50 p-3 text-sm font-semibold text-green-700 ring-1 ring-green-100">
          Found {state.result.ingredients.length} ingredients and{" "}
          {state.result.equipment.length} tools. These will be{" "}
          <strong>added</strong> to your kitchen — existing items won&apos;t be
          removed.
        </div>
      )}

      {state.status === "error" && (
        <div className="rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700 ring-1 ring-red-100">
          {state.message}
        </div>
      )}
    </div>
  );
}
