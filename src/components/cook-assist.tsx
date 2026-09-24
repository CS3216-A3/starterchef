"use client";

import {
  Camera,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Timer,
  Video,
  VideoOff,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { StepAskBox } from "@/components/step-assist";
import { VoiceAssistantButton } from "@/components/voice-assistant-button";
import type { AssistantReply } from "@/lib/ai/schemas/assistant";
import type { StepCheck } from "@/lib/ai/schemas/cooking";
import type { CookingSessionRow } from "@/lib/types";
import { clientErrorMessage } from "@/lib/client-error";
import { cn } from "@/lib/utils";
import { loadActiveRecipeDraft } from "@/lib/active-recipe-draft";

/**
 * All the interactive assists on the cook screen, sharing one camera stream
 * and one timer:
 * - "Show my food" keeps a live camera tile open; the next question (voice or
 *   text) auto-snaps a frame so the assistant can see what you're showing.
 * - StepTimer is editable — adjust before or extend while running. The
 *   assistant can also set timers and jump steps via voice actions.
 */
export function CookAssist({
  sessionId,
  recipeId,
  stepIndex,
  currentInstruction,
  totalSteps,
  durationSeconds,
  version,
  timerState,
}: {
  sessionId: string;
  recipeId: string | null;
  stepIndex: number;
  currentInstruction: string;
  totalSteps: number;
  durationSeconds?: number;
  version: number;
  timerState: CookingSessionRow["timer_state"];
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<
    (StepCheck & { previewUrl?: string | null }) | null
  >(null);
  // The last frame sent to the model — shown to the user so what the AI saw
  // is never a mystery.
  const [proposal, setProposal] = useState<
    | (NonNullable<AssistantReply["action"]> & {
        proposedForStep: number;
        expectedVersion: number;
      })
    | null
  >(null);
  const [checkpointProposal, setCheckpointProposal] = useState<{
    stepIndex: number;
    title: string;
    detail: string;
    replacementInstruction: string;
    expectedVersion: number;
  } | null>(null);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changePending, setChangePending] = useState(false);
  const [lastApplied, setLastApplied] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
    setCheck(null);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  // The <video> element only mounts once cameraOn flips true, so the stream
  // can't be attached inside toggleCamera — do it here after render.
  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraOn]);

  async function toggleCamera() {
    setCameraError(null);
    if (cameraOn) {
      stopCamera();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setCameraOn(true);
    } catch {
      setCameraError("Camera unavailable. Check permission and try again.");
    }
  }

  /** Snap a frame and ask the model whether the step looks right. */
  async function checkFood() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || !sessionId) return;
    const requestedVersion = version;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1024 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas
      .getContext("2d")
      ?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.8),
    );
    if (!blob) return;
    setChecking(true);
    setCheck(null);
    setCameraError(null);
    try {
      const form = new FormData();
      form.set(
        "image",
        new File([blob], "checkpoint.jpg", { type: "image/jpeg" }),
      );
      const res = await fetch(
        `/api/cooking-sessions/${sessionId}/checkpoints`,
        {
          method: "POST",
          body: form,
        },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(clientErrorMessage(body, "Check failed"));
      setCheck(body as StepCheck & { previewUrl?: string | null });
      setCheckpointProposal(
        body.proposal
          ? { ...body.proposal, expectedVersion: requestedVersion }
          : null,
      );
    } catch (err) {
      setCameraError(
        err instanceof Error ? err.message : "Something went wrong",
      );
    } finally {
      setChecking(false);
    }
  }

  /** AI actions remain proposals until a visible user confirmation. */
  const handleAction = useCallback(
    (action: NonNullable<AssistantReply["action"]>) => {
      if (
        ((action.type === "substitute-ingredient" ||
          action.type === "adjust-step") &&
          action.detail?.trim() &&
          action.replacementInstruction?.trim()) ||
        (action.type === "set-timer" &&
          action.timerSeconds &&
          action.timerSeconds <= 86400) ||
        (action.type === "goto-step" &&
          action.stepIndex &&
          action.stepIndex >= 1 &&
          action.stepIndex <= totalSteps)
      )
        setProposal({
          ...action,
          proposedForStep: stepIndex,
          expectedVersion: version,
        });
    },
    [stepIndex, totalSteps, version],
  );

  async function acceptProposal() {
    if (!proposal) return;
    setChangePending(true);
    setChangeError(null);
    const target =
      proposal.type === "goto-step" && proposal.stepIndex
        ? proposal.stepIndex
        : proposal.proposedForStep;
    const route =
      proposal.type === "goto-step"
        ? "progress"
        : proposal.type === "set-timer"
          ? "timer"
          : "adjustments";
    const now = new Date();
    const duration = proposal.timerSeconds ?? 0;
    const body =
      route === "progress"
        ? { currentStep: target, expectedVersion: proposal.expectedVersion }
        : route === "timer"
          ? {
              timer: {
                status: "running",
                stepIndex: proposal.proposedForStep,
                durationSeconds: duration,
                startedAt: now.toISOString(),
                endsAt: new Date(now.getTime() + duration * 1000).toISOString(),
              },
              expectedVersion: proposal.expectedVersion,
            }
          : {
              proposal: {
                stepIndex: proposal.proposedForStep,
                title:
                  proposal.type === "substitute-ingredient"
                    ? "Ingredient substitution"
                    : "Step adjustment",
                detail: proposal.detail ?? "",
                replacementInstruction: proposal.replacementInstruction ?? "",
              },
              expectedVersion: proposal.expectedVersion,
            };
    try {
      const response = await fetch(
        `/api/cooking-sessions/${sessionId}/${route}`,
        {
          method:
            route === "progress" ? "PATCH" : route === "timer" ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) {
        if (response.status === 409) setProposal(null);
        setChangeError(
          response.status === 409
            ? "This session changed in another tab. Refreshing the latest state."
            : "Could not apply that suggestion",
        );
        router.refresh();
        return;
      }
      setLastApplied(
        route === "adjustments"
          ? `Apply this change throughout the recipe: ${proposal.detail}. For this step use: ${proposal.replacementInstruction}`.slice(
              0,
              1000,
            )
          : null,
      );
      setProposal(null);
      router.refresh();
    } catch {
      setChangeError("Could not connect. Please try again.");
    } finally {
      setChangePending(false);
    }
  }

  async function saveForFutureSessions() {
    if (!recipeId || !lastApplied) return;
    setChangePending(true);
    setChangeError(null);
    try {
      const response = await fetch("/api/recipe-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "adapted",
          recipeId,
          intent: lastApplied,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (response.status === 409) {
        const active = await loadActiveRecipeDraft();
        if (active) {
          router.push(`/recipes/import?draft=${active.draftId}`);
          return;
        }
      }
      const body = await response.json().catch(() => null);
      if (!response.ok || typeof body?.draftId !== "string")
        throw new Error(
          body?.error?.message ?? "Could not start recipe review",
        );
      router.push(`/recipes/import?draft=${body.draftId}`);
    } catch (cause) {
      setChangeError(
        cause instanceof Error ? cause.message : "Could not save this change",
      );
    } finally {
      setChangePending(false);
    }
  }

  async function acceptCheckpointProposal() {
    if (!checkpointProposal) return;
    setChangePending(true);
    try {
      const response = await fetch(
        `/api/cooking-sessions/${sessionId}/adjustments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposal: {
              stepIndex: checkpointProposal.stepIndex,
              title: checkpointProposal.title,
              detail: checkpointProposal.detail,
              replacementInstruction: checkpointProposal.replacementInstruction,
            },
            expectedVersion: checkpointProposal.expectedVersion,
          }),
        },
      );
      if (!response.ok) {
        if (response.status === 409) setCheckpointProposal(null);
        setChangeError(
          response.status === 409
            ? "This session changed in another tab. Refreshing the latest state."
            : "Could not apply checkpoint suggestion",
        );
        router.refresh();
        return;
      }
      setCheckpointProposal(null);
      setLastApplied(
        `Apply this checkpoint change throughout the recipe: ${checkpointProposal.detail}. For this step use: ${checkpointProposal.replacementInstruction}`.slice(
          0,
          1000,
        ),
      );
      router.refresh();
    } catch {
      setChangeError("Could not connect. Please try again.");
    } finally {
      setChangePending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {(durationSeconds !== undefined || timerState.status !== "idle") && (
        <StepTimer
          sessionId={sessionId}
          stepIndex={stepIndex}
          version={version}
          seconds={durationSeconds ?? 60}
          persisted={timerState}
        />
      )}
      {proposal && (
        <div className="rounded-2xl bg-flame-soft p-4 text-sm font-semibold">
          <p className="font-extrabold">
            Suggested action for step {proposal.proposedForStep}
          </p>
          <p>
            {proposal.detail ??
              (proposal.type === "set-timer"
                ? `Set a ${proposal.timerSeconds ?? 0} second timer`
                : `Go to step ${proposal.stepIndex ?? proposal.proposedForStep}`)}
          </p>
          {proposal.replacementInstruction && (
            <div className="mt-3 flex flex-col gap-1 rounded-xl bg-card p-3 text-xs">
              <p>
                <span className="font-extrabold">Current step:</span>{" "}
                {currentInstruction}
              </p>
              <p>
                <span className="font-extrabold">After confirmation:</span>{" "}
                {proposal.replacementInstruction}
              </p>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              disabled={changePending}
              onClick={() => void acceptProposal()}
            >
              Confirm change
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setProposal(null)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}
      {changeError && (
        <p role="alert" className="text-xs font-bold text-flame">
          {changeError}
        </p>
      )}
      {lastApplied && !proposal && (
        <div className="rounded-2xl bg-oat p-4 text-sm font-semibold">
          <p>The change is applied to this cooking session.</p>
          {recipeId && (
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              disabled={changePending}
              onClick={() => void saveForFutureSessions()}
            >
              Save for future sessions (review first)
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={toggleCamera}
          className="self-start"
        >
          {cameraOn ? (
            <VideoOff className="h-4 w-4" />
          ) : (
            <Video className="h-4 w-4" />
          )}
          {cameraOn ? "Hide my food" : "Show my food"}
        </Button>
        {cameraOn && (
          <div className="overflow-hidden rounded-3xl ring-1 ring-oat">
            <button
              type="button"
              onClick={checkFood}
              disabled={checking}
              aria-label="Capture this frame for a check"
              className="group relative block w-full"
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="aspect-video w-full bg-espresso object-cover"
              />
              {/* Tap-to-capture overlay — the user picks the exact frame the
                  AI sees instead of whatever happens to be up first. */}
              <span className="absolute inset-0 flex items-end justify-center bg-espresso/0 pb-3 transition-colors group-hover:bg-espresso/20">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-card/90 px-3 py-1.5 text-xs font-extrabold text-espresso shadow-sm">
                  <Camera className="h-3.5 w-3.5" />
                  {checking ? "Checking…" : "Tap to check this frame"}
                  {!checking && <Sparkles className="h-3 w-3 text-flame" />}
                </span>
              </span>
            </button>
            <p className="bg-card px-3 py-1.5 text-xs font-semibold text-espresso-light">
              StarterChef sees only the frame you tap to check.
            </p>
          </div>
        )}
        {check && (
          <div className="rounded-2xl bg-oat p-3">
            {check.previewUrl && (
              <Image
                src={check.previewUrl}
                alt="Your checkpoint"
                width={144}
                height={96}
                unoptimized
                className="mb-2 h-24 w-36 rounded-xl object-cover"
              />
            )}
            <p className="text-sm font-extrabold">
              {check.looksRight === true
                ? "Looks good ✓"
                : check.looksRight === false
                  ? "Needs a small fix"
                  : "Can't quite tell"}
            </p>
            <p className="text-sm font-semibold text-espresso-light">
              {check.feedback}
            </p>
            {check.tip && (
              <p className="mt-1 text-xs font-bold text-flame">
                Try: {check.tip}
              </p>
            )}
          </div>
        )}
        {checkpointProposal && (
          <div className="rounded-2xl bg-flame-soft p-3 text-sm font-semibold">
            <p>
              Step {checkpointProposal.stepIndex}: {checkpointProposal.detail}
            </p>
            <p className="mt-1 text-xs">
              New instruction: {checkpointProposal.replacementInstruction}
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                disabled={changePending}
                onClick={() => void acceptCheckpointProposal()}
              >
                Accept adjustment
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCheckpointProposal(null)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}
        {cameraError && (
          <p className="text-xs font-bold text-flame">{cameraError}</p>
        )}
      </div>

      <VoiceAssistantButton
        sessionId={sessionId}
        busy={checking}
        onAction={handleAction}
      />

      <StepAskBox sessionId={sessionId} onAction={handleAction} />
    </div>
  );
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** The persisted end timestamp is authoritative across refreshes. */
function StepTimer({
  sessionId,
  stepIndex,
  version,
  seconds,
  persisted,
}: {
  sessionId: string;
  stepIndex: number;
  version: number;
  seconds: number;
  persisted: CookingSessionRow["timer_state"];
}) {
  const router = useRouter();
  // The initial value is stable across server and browser hydration.
  const [now, setNow] = useState(0);
  const [selectedSeconds, setSelectedSeconds] = useState(seconds);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const initialTick = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(initialTick);
      window.clearInterval(timer);
    };
  }, []);
  const sameStep = persisted.stepIndex === stepIndex;
  const running = sameStep && persisted.status === "running";
  const paused = sameStep && persisted.status === "paused";
  const remaining =
    running && persisted.endsAt
      ? now === 0
        ? (persisted.durationSeconds ?? selectedSeconds)
        : Math.max(
            0,
            Math.ceil((new Date(persisted.endsAt).getTime() - now) / 1000),
          )
      : paused
        ? (persisted.pausedRemainingSeconds ?? selectedSeconds)
        : selectedSeconds;
  async function save(
    status: "running" | "paused" | "idle",
    duration = selectedSeconds,
  ) {
    setBusy(true);
    setError(null);
    const start = new Date();
    const timer =
      status === "idle"
        ? { status }
        : status === "paused"
          ? {
              status,
              stepIndex,
              durationSeconds: selectedSeconds,
              pausedRemainingSeconds: remaining,
            }
          : {
              status,
              stepIndex,
              durationSeconds: duration,
              startedAt: start.toISOString(),
              endsAt: new Date(start.getTime() + duration * 1000).toISOString(),
            };
    try {
      const response = await fetch(`/api/cooking-sessions/${sessionId}/timer`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timer, expectedVersion: version }),
      });
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? "Timer changed in another tab. Reloading."
            : "Could not save timer",
        );
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save timer");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-card p-4 shadow-sm ring-1",
        remaining === 0 ? "ring-flame" : "ring-oat",
      )}
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-2 text-2xl font-extrabold tabular-nums">
          <Timer className="h-6 w-6 text-espresso-light" />
          {formatDuration(remaining)}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={busy || running}
            onClick={() =>
              setSelectedSeconds((value) => Math.max(30, value - 60))
            }
            aria-label="One minute less"
            className="rounded-full bg-oat px-2.5 py-1 text-xs font-extrabold text-espresso"
          >
            −1m
          </button>
          <button
            type="button"
            disabled={busy || running}
            onClick={() =>
              setSelectedSeconds((value) => Math.min(86400, value + 60))
            }
            aria-label="One minute more"
            className="rounded-full bg-oat px-2.5 py-1 text-xs font-extrabold text-espresso"
          >
            +1m
          </button>
        </div>
      </div>
      <div className="flex gap-2">
        {(running || paused) && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void save("idle")}
          >
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() =>
            void (running
              ? save("paused")
              : save("running", paused ? remaining : selectedSeconds))
          }
        >
          {running ? (
            <>
              <Pause className="h-4 w-4" /> Pause
            </>
          ) : (
            <>
              <Play className="h-4 w-4" /> {paused ? "Resume" : "Start"}
            </>
          )}
        </Button>
      </div>
      {error && <p className="w-full text-xs font-bold text-flame">{error}</p>}
    </div>
  );
}
