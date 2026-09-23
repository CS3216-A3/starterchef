"use client";

import { useEffect, useState } from "react";
import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { getApiErrorMessage } from "@/lib/client-api-error";

type DraftStatus =
  | "queued"
  | "acquiring_source"
  | "extracting_or_generating"
  | "verifying"
  | "adjudicating"
  | "awaiting_user_acceptance"
  | "accepted"
  | "rejected"
  | "failed_retryable"
  | "failed_permanent"
  | "blocked";

type DraftResponse = {
  draftId: string;
  status: DraftStatus;
  failureCode: string | null;
  restartCount?: number;
  acceptedRecipeId: string | null;
  updatedAt: string;
  review: {
    summary?: string;
    verdict?: string;
    findings?: { severity?: string; message?: string }[];
    gemini_final?: {
      summary?: string;
      findings?: { severity?: string; message?: string }[];
    };
    verification_final?: {
      summary?: string;
      findings?: { severity?: string; message?: string }[];
    };
  } | null;
};

const STAGES: { statuses: DraftStatus[]; label: string; detail: string }[] = [
  {
    statuses: ["queued", "acquiring_source"],
    label: "Preparing your recipe",
    detail: "We’re securely loading your source and cooking preferences.",
  },
  {
    statuses: ["extracting_or_generating"],
    label: "Building the recipe",
    detail: "We’re turning it into clear beginner-friendly steps.",
  },
  {
    statuses: ["verifying"],
    label: "Safety check",
    detail:
      "Weâ€™re checking ingredients, timings, allergens, and instructions.",
  },
  {
    statuses: ["adjudicating"],
    label: "Reviewing findings",
    detail: "We’re resolving any issues before showing you a recipe.",
  },
  {
    statuses: ["awaiting_user_acceptance"],
    label: "Ready for your review",
    detail: "Verification passed. You choose whether to save it.",
  },
];

function currentStage(status: DraftStatus) {
  return STAGES.findIndex((stage) => stage.statuses.includes(status));
}

export function RecipeDraftProgress({ draftId }: { draftId: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/recipe-drafts/${draftId}`, {
          cache: "no-store",
        });
        if (!response.ok)
          throw new Error(
            await getApiErrorMessage(response, "Could not load recipe review"),
          );
        const next = (await response.json()) as DraftResponse;
        if (cancelled) return;
        setDraft(next);
        setError(null);
        if (!isTerminal(next.status)) timer = setTimeout(refresh, 2000);
      } catch (cause) {
        if (cancelled) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load recipe review",
        );
        timer = setTimeout(refresh, 4000);
      }
    };
    void refresh();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [draftId, refreshNonce]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function decide(action: "accept" | "reject") {
    setActing(true);
    try {
      const response = await fetch(`/api/recipe-drafts/${draftId}/${action}`, {
        method: "POST",
      });
      if (!response.ok)
        throw new Error(
          await getApiErrorMessage(response, `Could not ${action} recipe`),
        );
      if (action === "accept") {
        const { recipeId } = (await response.json()) as { recipeId: string };
        router.push(`/recipes/${recipeId}`);
      } else {
        router.push("/recipes");
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : `Could not ${action} recipe`,
      );
      setActing(false);
    }
  }

  async function restart() {
    setActing(true);
    try {
      const response = await fetch(`/api/recipe-drafts/${draftId}/restart`, {
        method: "POST",
      });
      if (!response.ok)
        throw new Error(
          await getApiErrorMessage(response, "Could not restart recipe review"),
        );
      const next = (await response.json()) as { restartCount: number };
      setDraft((current) =>
        current
          ? {
              ...current,
              status: "queued",
              failureCode: null,
              restartCount: next.restartCount,
            }
          : current,
      );
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not restart recipe review",
      );
    } finally {
      setActing(false);
    }
  }

  const stage = draft ? currentStage(draft.status) : 0;
  const finalReview =
    draft?.review?.verification_final ??
    draft?.review?.gemini_final ??
    draft?.review;
  const failure =
    draft &&
    ["blocked", "failed_permanent", "failed_retryable", "rejected"].includes(
      draft.status,
    );
  const secondsSinceUpdate = draft
    ? Math.max(
        0,
        Math.floor((now - new Date(draft.updatedAt).getTime()) / 1000),
      )
    : 0;
  const takingLonger =
    draft && !isTerminal(draft.status) && secondsSinceUpdate >= 90;

  return (
    <section
      className="flex flex-col gap-5 rounded-3xl bg-card p-6 shadow-sm ring-1 ring-oat"
      aria-live="polite"
    >
      <div>
        <p className="text-xs font-extrabold tracking-wide text-flame uppercase">
          Recipe review
        </p>
        <h2 className="mt-1 text-xl font-extrabold">
          {failure
            ? "This recipe needs another try"
            : draft?.status === "awaiting_user_acceptance"
              ? "Your verified recipe is ready"
              : "Checking your recipe"}
        </h2>
        <p className="mt-1 text-sm font-semibold text-espresso-light">
          {failure
            ? failureMessage(draft.status, draft.failureCode)
            : draft
              ? STAGES[Math.max(stage, 0)]?.detail
              : "Connecting to your recipe review…"}
        </p>
        {draft && !failure && (
          <p className="mt-2 text-xs font-bold text-espresso-light">
            Live status: last workflow update{" "}
            {formatElapsed(secondsSinceUpdate)} ago.
          </p>
        )}
      </div>

      <ol className="flex flex-col gap-3">
        {STAGES.map((item, index) => {
          const complete = stage > index || draft?.status === "accepted";
          const active = stage === index && !failure;
          return (
            <li
              key={item.label}
              className="flex items-center gap-3 text-sm font-bold"
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${complete ? "bg-flame text-white" : active ? "bg-flame-soft text-flame" : "bg-oat text-espresso-light"}`}
              >
                {complete ? (
                  <Check className="h-4 w-4" />
                ) : active ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  index + 1
                )}
              </span>
              {item.label}
            </li>
          );
        })}
      </ol>

      {finalReview?.summary && (
        <p className="rounded-2xl bg-oat p-3 text-sm font-semibold text-espresso-light">
          {finalReview.summary}
        </p>
      )}
      {finalReview?.findings?.length ? (
        <ul className="flex flex-col gap-2 rounded-2xl bg-oat p-3 text-sm font-semibold text-espresso-light">
          {finalReview.findings.map((finding, index) => (
            <li key={`${finding.message}-${index}`}>{finding.message}</li>
          ))}
        </ul>
      ) : null}

      {takingLonger && (
        <div className="rounded-2xl bg-oat p-3 text-sm font-semibold text-espresso-light">
          <p className="font-extrabold text-espresso">
            Still working on this step
          </p>
          <p className="mt-1">
            The AI provider may be retrying because it is busy. This review is
            saved securely: you can leave this page and return to this same URL
            later. If the retries are exhausted, this page will offer a safe
            retry without another upload.
          </p>
        </div>
      )}

      {!failure && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setRefreshNonce((value) => value + 1)}
          disabled={acting}
        >
          Refresh status
        </Button>
      )}

      {draft?.status === "awaiting_user_acceptance" && (
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => void decide("reject")}
            disabled={acting}
          >
            Reject
          </Button>
          <Button
            className="flex-1"
            onClick={() => void decide("accept")}
            disabled={acting}
          >
            {acting ? "Saving…" : "Accept recipe"}
          </Button>
        </div>
      )}
      {failure && (
        <div className="flex items-start gap-2 rounded-2xl bg-flame-soft p-3 text-sm font-bold text-espresso">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {draft.failureCode
            ? `Review code: ${draft.failureCode}`
            : "You can start a new recipe review with a clearer source."}
        </div>
      )}
      {draft?.status === "failed_retryable" &&
        (draft.restartCount ?? 0) < 2 && (
          <Button
            className="w-full"
            onClick={() => void restart()}
            disabled={acting}
          >
            {acting ? "Restartingâ€¦" : "Retry review"}
          </Button>
        )}
      {error && (
        <p className="rounded-2xl bg-flame-soft p-3 text-sm font-bold text-espresso">
          {error}
        </p>
      )}
    </section>
  );
}

function isTerminal(status: DraftStatus) {
  return [
    "awaiting_user_acceptance",
    "accepted",
    "rejected",
    "failed_retryable",
    "failed_permanent",
    "blocked",
  ].includes(status);
}

function failureMessage(status: DraftStatus, code: string | null) {
  if (code === "PROVIDER_TEMPORARILY_UNAVAILABLE")
    return "The AI provider is temporarily busy. You can retry this review without uploading the recipe again.";
  if (status === "failed_retryable")
    return "The verification service had a temporary problem. Start a new review in a moment.";
  if (status === "blocked")
    return "We found a safety or dietary issue, so this recipe cannot be saved.";
  return "This review is no longer available.";
}

function formatElapsed(seconds: number) {
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
