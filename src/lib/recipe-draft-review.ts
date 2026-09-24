export type VerificationReport = {
  summary?: string;
  findings?: {
    severity?: string;
    category?: string;
    message?: string;
  }[];
};

export type DraftVerification = VerificationReport & {
  sourceAssessment?: {
    sourceType?: "recipe_card" | "finished_dish" | "unusable";
    summary?: string;
    visibleFacts?: string[];
    uncertainties?: string[];
    clarificationQuestion?: string | null;
  };
  assumptions?: string[];
  photoCompleteness?: VerificationReport;
  verification_initial?: VerificationReport;
  verification_final?: VerificationReport;
  adjudication?: VerificationReport;
  // Earlier reviews used provider-specific keys.
  gemini_initial?: VerificationReport;
  gemini_final?: VerificationReport;
};

/** Show the report that caused a block, not a later or unrelated report. */
export function selectDraftVerificationReport(
  status: string,
  failureCode: string | null,
  verification: DraftVerification | null,
): VerificationReport | null {
  if (!verification) return null;
  const initial =
    verification.verification_initial ?? verification.gemini_initial;
  const final = verification.verification_final ?? verification.gemini_final;
  const adjudication = verification.adjudication;

  if (status === "blocked") {
    if (failureCode === "INITIAL_INDEPENDENT_VERIFIER_BLOCKED")
      return initial ?? null;
    if (failureCode === "PHOTO_RECIPE_INCOMPLETE")
      return verification.photoCompleteness ?? null;
    if (
      failureCode === "PHOTO_CLARIFICATION_EXPIRED" ||
      failureCode === "PHOTO_INPUT_EXPIRED"
    )
      return verification.summary ? verification : null;
    if (
      failureCode === "FINAL_INDEPENDENT_VERIFIER_FAILED" ||
      failureCode === "FINAL_REVISION_UNRESOLVED"
    )
      return final ?? null;
    if (
      failureCode === "ADJUDICATION_BLOCKED" ||
      failureCode === "REVISION_LIMIT_REACHED" ||
      failureCode === "INVALID_REVISION"
    )
      return adjudication ?? null;
    return null;
  }

  return final ?? adjudication ?? initial ?? verification;
}
