"use client";

import { ImageUp } from "lucide-react";
import { useState } from "react";

type UploadState =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "success" }
  | { status: "error"; message: string };

export function KitchenImageUpload() {
  const [state, setState] = useState<UploadState>({ status: "idle" });

  async function upload(file: File) {
    setState({ status: "uploading" });
    const form = new FormData();
    form.set("file", file);
    try {
      const response = await fetch("/api/kitchen-images", {
        method: "POST",
        body: form,
      });
      const body = (await response.json().catch(() => null)) as {
        path?: string;
        error?: { message?: string };
      } | null;
      if (!response.ok || !body?.path)
        throw new Error(body?.error?.message ?? "Upload failed");
      setState({ status: "success" });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Upload failed",
      });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-oat px-6 font-bold text-espresso transition-colors hover:bg-oat-dark">
        <ImageUp className="h-5 w-5" />
        {state.status === "uploading"
          ? "Uploading..."
          : "Upload a pantry photo"}
        <input
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={state.status === "uploading"}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = "";
          }}
        />
      </label>
      {state.status === "success" ? (
        <p className="text-xs font-semibold text-espresso-light">
          Uploaded privately. This photo is visible only to you.
        </p>
      ) : null}
      {state.status === "error" ? (
        <p role="alert" className="text-xs font-bold text-flame-dark">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
