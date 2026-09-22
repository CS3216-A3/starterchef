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
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { StepAskBox } from "@/components/step-assist";
import { VoiceAssistantButton } from "@/components/voice-assistant-button";
import type { AssistantReply } from "@/lib/ai/schemas/assistant";
import type { StepCheck } from "@/lib/ai/schemas/cooking";
import { cn } from "@/lib/utils";

export interface CookContext {
  recipeTitle: string;
  stepTitle: string;
  instruction: string;
  photoCheckpoint?: string;
  recipeId?: string;
  recipeSlug?: string;
}

/**
 * All the interactive assists on the cook screen, sharing one camera stream
 * and one timer:
 * - "Show my food" keeps a live camera tile open; the next question (voice or
 *   text) auto-snaps a frame so the assistant can see what you're showing.
 * - StepTimer is editable — adjust before or extend while running. The
 *   assistant can also set timers and jump steps via voice actions.
 */
export function CookAssist({
  context,
  sessionId,
  stepIndex,
  cookUrl,
  totalSteps,
  durationSeconds,
}: {
  context: CookContext;
  sessionId?: string;
  stepIndex: number;
  /** e.g. /cook/tomato-egg-stir-fry — used for voice "go to step N". */
  cookUrl: string;
  totalSteps: number;
  durationSeconds?: number;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<StepCheck | null>(null);
  const [timerSeconds, setTimerSeconds] = useState<number | undefined>(
    durationSeconds,
  );
  // Bumped when a new duration should reset the timer (assistant set one, or
  // the step's own duration changed). ±1m taps don't touch it — they extend
  // or shorten a running timer without restarting it.
  const [timerEpoch, setTimerEpoch] = useState(0);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

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
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraOn(true);
    } catch {
      setCameraError("Camera unavailable. Check permission and try again.");
    }
  }

  /** Grab a JPEG frame from the live camera, or null when it's off. */
  const snapFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || !streamRef.current || video.videoWidth === 0) return null;
    const canvas = document.createElement("canvas");
    // Downscale — the model doesn't need full resolution and it keeps the
    // request small.
    const scale = Math.min(1, 768 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas
      .getContext("2d")
      ?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  }, []);

  /** Snap a frame and ask the model whether the step looks right. */
  async function checkFood() {
    const frame = snapFrame();
    if (!frame) return;
    setChecking(true);
    setCheck(null);
    setCameraError(null);
    try {
      const res = await fetch("/api/ai/step-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: frame,
          context,
          sessionId,
          stepIndex,
          recipeId: context.recipeId,
          recipeSlug: context.recipeSlug,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Check failed");
      setCheck(body as StepCheck);
    } catch (err) {
      setCameraError(
        err instanceof Error ? err.message : "Something went wrong",
      );
    } finally {
      setChecking(false);
    }
  }

  /** Voice assistant actions — low-risk UI actions applied directly. */
  const handleAction = useCallback(
    (action: NonNullable<AssistantReply["action"]>) => {
      if (action.type === "set-timer" && action.timerSeconds) {
        setTimerSeconds(action.timerSeconds);
        setTimerEpoch((e) => e + 1);
      }
      if (action.type === "goto-step" && action.stepIndex) {
        const target = Math.min(Math.max(action.stepIndex, 1), totalSteps);
        router.push(`${cookUrl}?step=${target}`);
      }
    },
    [router, cookUrl, totalSteps],
  );

  return (
    <div className="flex flex-col gap-6">
      {timerSeconds !== undefined && (
        // key remounts the timer only on external sets — the step's duration
        // or an assistant "set a timer" action.
        <StepTimer
          key={`${durationSeconds ?? 0}-${timerEpoch}`}
          seconds={timerSeconds}
        />
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
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="aspect-video w-full bg-espresso object-cover"
            />
            <div className="flex flex-col gap-2 bg-card p-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={checkFood}
                disabled={checking}
                className="self-start"
              >
                <Camera className="h-4 w-4" />
                {checking ? "Checking…" : "Check my food"}
                {!checking && <Sparkles className="h-3.5 w-3.5" />}
              </Button>
              <p className="text-xs font-semibold text-espresso-light">
                StarterChef can see this view. Tap Check my food for a verdict,
                or just ask a question below.
              </p>
            </div>
          </div>
        )}
        {check && (
          <div className="rounded-2xl bg-oat p-3">
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
        {cameraError && (
          <p className="text-xs font-bold text-red-700">{cameraError}</p>
        )}
      </div>

      <VoiceAssistantButton
        recipeTitle={context.recipeTitle}
        stepTitle={context.stepTitle}
        sessionId={sessionId}
        stepIndex={stepIndex}
        instruction={context.instruction}
        photoCheckpoint={context.photoCheckpoint}
        recipeId={context.recipeId}
        recipeSlug={context.recipeSlug}
        snapFrame={cameraOn ? snapFrame : undefined}
        onAction={handleAction}
      />

      <StepAskBox
        context={context}
        sessionId={sessionId}
        stepIndex={stepIndex}
        snapFrame={cameraOn ? snapFrame : undefined}
        onAction={handleAction}
      />
    </div>
  );
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Editable countdown: adjust before starting or extend/shorten while
 *  running. Assistant "set a timer" actions land here too. */
function StepTimer({ seconds }: { seconds: number }) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          setRunning(false);
          setDone(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [running]);

  function adjust(delta: number) {
    setRemaining((r) => Math.max(30, r + delta));
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-card p-4 shadow-sm ring-1",
        done ? "ring-flame" : "ring-oat",
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
            onClick={() => adjust(-60)}
            aria-label="One minute less"
            className="rounded-full bg-oat px-2.5 py-1 text-xs font-extrabold text-espresso hover:bg-oat-dark"
          >
            −1m
          </button>
          <button
            type="button"
            onClick={() => adjust(60)}
            aria-label="One minute more"
            className="rounded-full bg-oat px-2.5 py-1 text-xs font-extrabold text-espresso hover:bg-oat-dark"
          >
            +1m
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {done && (
          <span className="text-sm font-extrabold text-flame">Time!</span>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            if (done) {
              setRemaining(seconds);
              setDone(false);
              return;
            }
            setRunning((r) => !r);
          }}
        >
          {running ? (
            <>
              <Pause className="h-4 w-4" /> Pause
            </>
          ) : done ? (
            <>
              <RotateCcw className="h-4 w-4" /> Restart
            </>
          ) : (
            <>
              <Play className="h-4 w-4" /> Start
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
