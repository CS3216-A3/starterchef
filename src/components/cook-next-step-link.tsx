"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/button";
import { trackEvent } from "@/lib/posthog/events";

/** "Done, next step" — same navigation as a plain Link, plus a step_completed event. */
export function CookNextStepLink({
  href,
  recipeSlug,
  completedStepIndex,
}: {
  href: string;
  recipeSlug: string;
  completedStepIndex: number;
}) {
  return (
    <Link
      href={href}
      onClick={() =>
        trackEvent("step_completed", {
          recipe_slug: recipeSlug,
          step_index: completedStepIndex,
        })
      }
    >
      <Button size="md">
        Done, next step <ArrowRight className="h-4 w-4" />
      </Button>
    </Link>
  );
}
