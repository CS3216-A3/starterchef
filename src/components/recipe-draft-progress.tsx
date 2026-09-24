"use client";

import { useEffect, useState } from "react";
import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { getApiErrorMessage } from "@/lib/client-api-error";
import {
  selectDraftVerificationReport,
  type DraftVerification,
} from "@/lib/recipe-draft-review";

type DraftRecipe = {
  title: string;
  description?: string;
  minutes: number;
  difficulty: "easy" | "medium" | "hard";
  servings: number;
  ingredients: string[];
  equipment: string[];
  steps: {
    index: number;
    title: string;
    instruction: string;
    durationSeconds?: number;
    ingredientsUsed: string[];
    tip?: string;
    photoCheckpoint?: string;
  }[];
  tags: string[];
  whyGood?: string;
};

type DraftStatus =
  | "queued"
  | "acquiring_source"
  | "extracting_or_generating"
  | "verifying"
  | "adjudicating"
  | "awaiting_user_input"
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
  recipe: DraftRecipe | null;
  updatedAt: string;
  review: DraftVerification | null;
  clarificationExpiresAt?: string | null;
};

const STAGES: { statuses: DraftStatus[]; label: string; detail: string }[] = [
  {
    statuses: ["queued", "acquiring_source"],
    label: "Preparing your recipe",
    detail: "We’re securely loading your source and cooking preferences.",
  },
  {
    statuses: ["extracting_or_generating", "awaiting_user_input"],
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

export function RecipeDraftProgress({
  draftId,
  onStartOver,
}: {
  draftId: string;
  onStartOver?: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [clarification, setClarification] = useState("");
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
      setRefreshNonce((value) => value + 1);
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

  async function submitClarification() {
    setActing(true);
    try {
      const response = await fetch(`/api/recipe-drafts/${draftId}/clarify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: clarification.trim() }),
      });
      if (!response.ok)
        throw new Error(
          await getApiErrorMessage(response, "Could not resume recipe review"),
        );
      setDraft((current) =>
        current ? { ...current, status: "queued" } : current,
      );
      setClarification("");
      setError(null);
      setRefreshNonce((value) => value + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not resume recipe review",
      );
      setRefreshNonce((value) => value + 1);
    } finally {
      setActing(false);
    }
  }

  const stage = draft ? currentStage(draft.status) : 0;
  const selectedReview = draft
    ? selectDraftVerificationReport(
        draft.status,
        draft.failureCode,
        draft.review,
      )
    : null;
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
  const possiblyStalled = takingLonger && secondsSinceUpdate >= 600;

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
            ? draft.status === "blocked"
              ? "This recipe did not pass review"
              : "This recipe needs another try"
            : draft?.status === "awaiting_user_input"
              ? "One detail will help us finish"
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

      {draft?.status === "blocked" && (
        <h3 className="text-sm font-extrabold text-espresso">
          Why this review was blocked
        </h3>
      )}
      {selectedReview?.summary && (
        <p className="rounded-2xl bg-oat p-3 text-sm font-semibold text-espresso-light">
          {selectedReview.summary}
        </p>
      )}
      {selectedReview?.findings?.length ? (
        <ul className="flex flex-col gap-2 rounded-2xl bg-oat p-3 text-sm font-semibold text-espresso-light">
          {selectedReview.findings.map((finding, index) => (
            <li key={`${finding.message}-${index}`}>
              {finding.severity && (
                <span className="mr-1 font-extrabold text-espresso capitalize">
                  {finding.severity}:
                </span>
              )}
              {finding.message}
            </li>
          ))}
        </ul>
      ) : null}
      {draft?.status === "blocked" &&
        !selectedReview?.summary &&
        !selectedReview?.findings?.length && (
          <p className="rounded-2xl bg-oat p-3 text-sm font-semibold text-espresso-light">
            Detailed findings were not saved for this review. You can try a
            clearer recipe source or contact support with the review code below.
          </p>
        )}

      {draft?.status === "awaiting_user_input" && (
        <div className="flex flex-col gap-3 rounded-2xl bg-oat p-4">
          {draft.review?.sourceAssessment?.summary && (
            <p className="text-sm font-semibold text-espresso-light">
              {draft.review.sourceAssessment.summary}
            </p>
          )}
          <label
            htmlFor={`clarification-${draftId}`}
            className="text-sm font-extrabold"
          >
            {draft.review?.sourceAssessment?.clarificationQuestion ??
              "What dish is this, and what are its main ingredients?"}
          </label>
          <textarea
            id={`clarification-${draftId}`}
            value={clarification}
            onChange={(event) => setClarification(event.target.value)}
            maxLength={2000}
            rows={3}
            className="rounded-2xl border-2 border-espresso/10 bg-card p-3 text-sm outline-none focus:border-flame"
            placeholder="Add the dish name or ingredients you know"
          />
          {draft.clarificationExpiresAt && (
            <p className="text-xs font-semibold text-espresso-light">
              Reply before{" "}
              {new Date(draft.clarificationExpiresAt).toLocaleString()}. The
              private photo is retained for only 24 hours after upload.
            </p>
          )}
          <Button
            onClick={() => void submitClarification()}
            disabled={acting || !clarification.trim()}
          >
            {acting ? "Resuming…" : "Continue recipe review"}
          </Button>
        </div>
      )}

      {draft?.status === "awaiting_user_acceptance" && draft.recipe && (
        <>
          {draft.review?.sourceAssessment && (
            <div className="rounded-2xl bg-oat p-4 text-sm font-semibold text-espresso-light">
              <p className="font-extrabold text-espresso">
                {draft.review.sourceAssessment.sourceType === "recipe_card"
                  ? "Completed from a recipe card"
                  : "Approximation from a dish photo"}
              </p>
              <p className="mt-1">
                Please check inferred details before saving.
              </p>
              {draft.review.assumptions?.length ? (
                <ul className="mt-2 list-disc pl-5">
                  {draft.review.assumptions.map((assumption) => (
                    <li key={assumption}>{assumption}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
          <DraftRecipePreview recipe={draft.recipe} />
        </>
      )}

      {takingLonger && (
        <div className="rounded-2xl bg-oat p-3 text-sm font-semibold text-espresso-light">
          <p className="font-extrabold text-espresso">
            {possiblyStalled
              ? "No recent review update"
              : "Still working on this step"}
          </p>
          <p className="mt-1">
            {possiblyStalled
              ? "This review may be stuck. Refresh its status, or cancel it to start a new import. Cancelling will not save a recipe."
              : "The AI provider may be retrying because it is busy. This review is saved securely: you can leave this page and return to this same URL later."}
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
      {draft && !failure && !isTerminal(draft.status) && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => void decide("reject")}
          disabled={acting}
        >
          {acting ? "Cancelling…" : "Cancel review"}
        </Button>
      )}
      {failure && (
        <div className="flex items-start gap-2 rounded-2xl bg-flame-soft p-3 text-sm font-bold text-espresso">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {draft.failureCode
            ? `Review code: ${draft.failureCode}`
            : "You can start a new recipe review with a clearer source."}
        </div>
      )}
      {draft?.status === "blocked" && onStartOver && (
        <Button className="w-full" onClick={onStartOver}>
          Try another recipe
        </Button>
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

function DraftRecipePreview({ recipe }: { recipe: DraftRecipe }) {
  return (
    <article className="flex flex-col gap-5 rounded-2xl bg-oat p-4">
      <div>
        <p className="text-xs font-extrabold tracking-wide text-flame uppercase">
          Recipe to save
        </p>
        <h3 className="mt-1 text-lg font-extrabold">{recipe.title}</h3>
        {recipe.description && (
          <p className="mt-1 text-sm font-semibold text-espresso-light">
            {recipe.description}
          </p>
        )}
        <p className="mt-2 text-sm font-bold text-espresso-light">
          {recipe.minutes} min · {recipe.difficulty} · Serves {recipe.servings}
        </p>
      </div>

      <section>
        <h4 className="text-xs font-extrabold tracking-wide text-espresso-light uppercase">
          Ingredients
        </h4>
        <ul className="mt-2 grid gap-1 text-sm font-semibold sm:grid-cols-2">
          {recipe.ingredients.map((ingredient) => (
            <li key={ingredient}>{ingredient}</li>
          ))}
        </ul>
      </section>

      {recipe.equipment.length > 0 && (
        <section>
          <h4 className="text-xs font-extrabold tracking-wide text-espresso-light uppercase">
            Equipment
          </h4>
          <p className="mt-2 text-sm font-semibold text-espresso-light">
            {recipe.equipment.join(" · ")}
          </p>
        </section>
      )}

      <section>
        <h4 className="text-xs font-extrabold tracking-wide text-espresso-light uppercase">
          Steps
        </h4>
        <ol className="mt-2 flex flex-col gap-3">
          {recipe.steps.map((step) => (
            <li key={step.index} className="text-sm font-semibold">
              <p className="font-extrabold">
                <span className="text-flame">{step.index}. </span>
                {step.title}
                {step.durationSeconds
                  ? ` (${formatStepDuration(step.durationSeconds)})`
                  : ""}
              </p>
              <p className="mt-1 text-espresso-light">{step.instruction}</p>
              {step.tip && (
                <p className="mt-1 text-xs font-bold text-espresso-light">
                  Tip: {step.tip}
                </p>
              )}
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}

function isTerminal(status: DraftStatus) {
  return [
    "awaiting_user_acceptance",
    "awaiting_user_input",
    "accepted",
    "rejected",
    "failed_retryable",
    "failed_permanent",
    "blocked",
  ].includes(status);
}

function failureMessage(status: DraftStatus, code: string | null) {
  if (code === "PHOTO_CLARIFICATION_EXPIRED" || code === "PHOTO_INPUT_EXPIRED")
    return "The private photo expired before this review could finish. Upload it again to start a new recipe.";
  if (code === "PROVIDER_TEMPORARILY_UNAVAILABLE")
    return "The AI provider is temporarily busy. You can retry this review without uploading the recipe again.";
  if (status === "failed_retryable")
    return "The verification service had a temporary problem. Start a new review in a moment.";
  if (status === "blocked")
    return "This draft did not pass verification, so it was not saved.";
  return "This review is no longer available.";
}

function formatElapsed(seconds: number) {
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function formatStepDuration(seconds: number) {
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}
