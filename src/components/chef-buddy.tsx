import Image from "next/image";
import { cn } from "@/lib/utils";

export type BuddyState = "idle" | "listening" | "thinking" | "speaking";

/**
 * The StarterChef mascot (public/logo.png — the flame with the chef hat) as a
 * living buddy you "speak to".
 * - idle: gentle float + fire flicker
 * - listening: orange glow + pulse ring
 * - thinking: side-to-side bob
 * - speaking: quicker bounce; `blip` increments retrigger a pop — driven by
 *   TTS word-boundary events where the browser exposes them (Web Speech API
 *   doesn't give real amplitude, so word boundaries are the best proxy).
 */
export function ChefBuddy({
  state,
  blip = 0,
  size = 72,
}: {
  state: BuddyState;
  /** Increment to retrigger a quick pop (e.g. per spoken word). */
  blip?: number;
  size?: number;
}) {
  const motion =
    state === "listening"
      ? "animate-[buddy-float_2s_ease-in-out_infinite]"
      : state === "thinking"
        ? "animate-[buddy-bob_1.2s_ease-in-out_infinite]"
        : state === "speaking"
          ? "animate-[buddy-bounce_0.9s_ease-in-out_infinite]"
          : "animate-[buddy-float_3.2s_ease-in-out_infinite]";

  return (
    <span className="relative inline-flex" aria-hidden="true">
      {state === "listening" && (
        <span className="absolute inset-0 animate-[buddy-ring_1.4s_ease-out_infinite] rounded-full bg-flame" />
      )}
      <span
        className={cn(
          "relative flex items-center justify-center rounded-full bg-flame-soft transition-shadow",
          state === "listening" && "shadow-[0_0_28px_6px] shadow-flame/60",
          motion,
        )}
        style={{ width: size, height: size }}
      >
        <Image
          key={`${state}-${blip}`}
          src="/logo.png"
          alt=""
          width={Math.round(size * 0.82)}
          height={Math.round(size * 0.82)}
          unoptimized
          className={cn(
            "object-contain",
            state === "speaking"
              ? "animate-[buddy-blip_0.4s_ease-out]"
              : "animate-[buddy-flicker_2.6s_ease-in-out_infinite]",
          )}
        />
      </span>
    </span>
  );
}
