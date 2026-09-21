"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/button";
import {
  completeCookingSession,
  startCookingSession,
} from "@/app/(app)/cook/[id]/actions";
import { trackEvent } from "@/lib/posthog/events";

/**
 * "Let's cook" / "View recipe" CTA. Creates (or reuses) an in-progress
 * cooking_sessions row, then navigates to the cook screen. If the insert
 * fails we still navigate so the UI never dead-ends.
 */
export function StartCookingButton({
  slug,
  primary,
  label,
}: {
  slug: string;
  primary?: boolean;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      trackEvent("cooking_session_started", { recipe_slug: slug });
      await startCookingSession(slug).catch(() => undefined);
      router.push(`/cook/${slug}`);
    });
  }

  return (
    <Button
      variant={primary ? "primary" : "outline"}
      size="sm"
      className="w-full"
      disabled={pending}
      onClick={handleClick}
    >
      {pending ? "Starting…" : label}
    </Button>
  );
}

/** "Finish cooking" on the last step — closes the session, goes home. */
export function FinishCookingButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      trackEvent("cooking_session_completed");
      await completeCookingSession().catch(() => undefined);
      router.push("/today");
    });
  }

  return (
    <Button size="md" disabled={pending} onClick={handleClick}>
      {pending ? "Finishing…" : "Finish cooking"}
      <ArrowRight className="h-4 w-4" />
    </Button>
  );
}
