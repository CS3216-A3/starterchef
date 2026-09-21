"use client";

import { ScanLine } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/button";
import type { KitchenScanResult } from "@/lib/ai/schemas/kitchen-scan";

type ScanState =
  | { status: "idle" }
  | { status: "scanning" }
  | { status: "done"; result: KitchenScanResult }
  | { status: "error"; message: string };

export function ScanKitchenButton() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ScanState>({ status: "idle" });

  async function handleFile(file: File) {
    setState({ status: "scanning" });
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

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

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      <Button
        size="md"
        className="w-full"
        disabled={state.status === "scanning"}
        onClick={() => fileInput.current?.click()}
      >
        <ScanLine className="h-5 w-5" />
        {state.status === "scanning" ? "Scanning…" : "Scan my kitchen"}
      </Button>

      {state.status === "done" && (
        <p className="text-xs font-semibold text-espresso-light">
          Found {state.result.ingredients.length} ingredients and{" "}
          {state.result.equipment.length} tools. Review them under Edit
          ingredients.
        </p>
      )}
      {state.status === "error" && (
        <p className="text-xs font-semibold text-flame-dark">{state.message}</p>
      )}
    </div>
  );
}
