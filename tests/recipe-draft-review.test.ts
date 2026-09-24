import { describe, expect, it } from "vitest";
import { selectDraftVerificationReport } from "@/lib/recipe-draft-review";

const verification = {
  verification_initial: {
    summary: "Initial safety concern",
    findings: [{ severity: "critical", message: "Chicken is undercooked" }],
  },
  adjudication: { summary: "Revision proposed" },
  verification_final: { summary: "Final timing concern" },
};

describe("draft verification rationale", () => {
  it("shows the initial findings when the initial verifier blocks", () => {
    expect(
      selectDraftVerificationReport(
        "blocked",
        "INITIAL_INDEPENDENT_VERIFIER_BLOCKED",
        verification,
      ),
    ).toEqual(verification.verification_initial);
  });

  it("shows the final report when final verification blocks", () => {
    expect(
      selectDraftVerificationReport(
        "blocked",
        "FINAL_INDEPENDENT_VERIFIER_FAILED",
        verification,
      ),
    ).toEqual(verification.verification_final);
  });

  it("shows the adjudication rationale when adjudication blocks", () => {
    expect(
      selectDraftVerificationReport(
        "blocked",
        "ADJUDICATION_BLOCKED",
        verification,
      ),
    ).toEqual(verification.adjudication);
  });

  it("does not misattribute old reports to deterministic blocks", () => {
    expect(
      selectDraftVerificationReport(
        "blocked",
        "DETERMINISTIC_RECIPE_INVALID",
        verification,
      ),
    ).toBeNull();
  });

  it("supports the earlier provider-specific report keys", () => {
    const oldReview = { gemini_initial: { summary: "Legacy concern" } };
    expect(
      selectDraftVerificationReport(
        "blocked",
        "INITIAL_INDEPENDENT_VERIFIER_BLOCKED",
        oldReview,
      ),
    ).toEqual(oldReview.gemini_initial);
  });

  it("shows final deterministic photo completeness findings", () => {
    const review = {
      ...verification,
      photoCompleteness: { summary: "Missing poultry instruction" },
    };
    expect(
      selectDraftVerificationReport(
        "blocked",
        "PHOTO_RECIPE_INCOMPLETE",
        review,
      ),
    ).toEqual(review.photoCompleteness);
  });
});
