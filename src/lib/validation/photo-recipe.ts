import type { ImportedRecipe } from "@/lib/ai/schemas/import";
import type { PhotoSourceAssessment } from "@/lib/ai/schemas/photo-recipe";
import type { IndependentVerification } from "@/lib/ai/schemas/recipe-verification";

export function requirePhotoClarification(
  assessment: PhotoSourceAssessment,
  allergies: string[] | null | undefined,
): PhotoSourceAssessment {
  if (assessment.clarificationQuestion) return assessment;
  if (assessment.sourceType === "unusable")
    return {
      ...assessment,
      clarificationQuestion:
        "What dish is this, and what are its main ingredients? The photo is not clear enough to identify them.",
    };
  if (
    allergies?.length &&
    (assessment.sourceType === "finished_dish" ||
      assessment.uncertainties.length > 0)
  )
    return {
      ...assessment,
      clarificationQuestion:
        "Does this dish contain any of your recorded allergens? Please list the sauce and other hidden ingredients you know.",
    };
  return assessment;
}

/** Structural backstop for photo recipes, not a substitute for the verifier. */
export function photoRecipeCompletenessFindings(
  recipe: ImportedRecipe,
  sourceType: string | undefined,
): string[] {
  const findings: string[] = [];
  if (sourceType) {
    if (recipe.steps.length < 3)
      findings.push("A photo recipe needs at least three cooking steps.");
    if (recipe.equipment.length === 0)
      findings.push("A photo recipe must list its equipment.");
  }
  const timedSeconds = recipe.steps.reduce(
    (total, step) => total + (step.durationSeconds ?? 0),
    0,
  );
  if (recipe.minutes * 60 < timedSeconds)
    findings.push("Total recipe time is shorter than its step timers.");
  const ingredients = recipe.ingredients.join(" ").toLowerCase();
  const hasPoultry = /\b(chicken|turkey|duck)\b/.test(ingredients);
  const explicitlyCooked = /\b(pre.?cooked|already cooked|rotisserie)\b/.test(
    ingredients,
  );
  const instructions = recipe.steps.map((step) => step.instruction).join(" ");
  if (
    hasPoultry &&
    !explicitlyCooked &&
    !/(?:74\s*°?\s*C|165\s*°?\s*F)/i.test(instructions)
  )
    findings.push(
      "Uncooked poultry needs an explicit 74°C / 165°F internal-temperature instruction.",
    );
  return findings;
}

export function applyPhotoCompleteness(
  report: IndependentVerification,
  findings: string[],
): IndependentVerification {
  if (!findings.length) return report;
  return {
    ...report,
    verdict: report.verdict === "block" ? "block" : "revise",
    summary:
      report.verdict === "pass"
        ? "The recipe needs structural or poultry-safety corrections."
        : report.summary,
    findings: [
      ...report.findings,
      ...findings.map((message) => ({
        severity: "critical" as const,
        category: "instruction" as const,
        message,
      })),
    ].slice(0, 20),
  };
}
