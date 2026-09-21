"use client";

import { Suspense, useEffect } from "react";
import { initPostHog } from "@/lib/posthog/client";
import { PostHogPageView } from "@/components/posthog-pageview";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);

  return (
    <>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </>
  );
}
