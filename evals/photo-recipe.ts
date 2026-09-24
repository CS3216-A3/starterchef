/** Manual prompt evaluation with a local, consented photo. Never commits or
 * persists the image or a provider transcript. */
import { readFileSync } from "node:fs";
import path from "node:path";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI may provide variables directly.
}

async function main() {
  const imagePath = process.argv[2];
  const dishHint = process.argv[3] ?? "";
  const clarification = process.argv[4] ?? "";
  if (!imagePath) {
    console.error(
      "Usage: npm.cmd run eval:photo -- <local-jpeg> [dish-hint] [clarification]",
    );
    process.exit(2);
  }

  const bytes = new Uint8Array(readFileSync(path.resolve(imagePath)));
  const mediaType = "image/jpeg";
  const [
    { getModel },
    { measuredGenerate },
    { renderPrompt },
    photoSchemas,
    verificationSchemas,
    validators,
  ] = await Promise.all([
    import("../src/lib/ai/model"),
    import("../src/lib/ai/instrument"),
    import("../src/lib/ai/prompts"),
    import("../src/lib/ai/schemas/photo-recipe"),
    import("../src/lib/ai/schemas/recipe-verification"),
    import("../src/lib/validation/photo-recipe"),
  ]);

  const profile = {
    dietary_restrictions: [] as string[],
    allergies: [] as string[],
    skill_level: "beginner",
    household_size: 2,
  };
  const context = {
    request: { dishHint, photoClarification: clarification },
    profile,
    pantry: [],
  };
  const photoMessage = (text: string) => [
    {
      role: "user" as const,
      content: [
        { type: "text" as const, text },
        { type: "file" as const, data: bytes, mediaType },
      ],
    },
  ];
  const normalized = (value: unknown) =>
    JSON.parse(
      JSON.stringify(value, (_key, item) => (item === undefined ? null : item)),
    );

  const classified = await measuredGenerate("eval-photo-classification", {
    model: getModel(),
    schema: photoSchemas.photoSourceAssessmentSchema,
    system: renderPrompt("photo-source-classify", {}),
    temperature: 0,
    messages: photoMessage(JSON.stringify(context)),
  });
  const assessment = validators.requirePhotoClarification(
    photoSchemas.photoSourceAssessmentSchema.parse(classified.object),
    profile.allergies,
  );
  console.log(
    JSON.stringify({
      stage: "classification",
      sourceType: assessment.sourceType,
      question: assessment.clarificationQuestion,
    }),
  );
  if (assessment.clarificationQuestion && !clarification) {
    console.error(
      "Clarification required; rerun with an answer as the third argument.",
    );
    process.exit(2);
  }

  const generated = await measuredGenerate("eval-photo-generation", {
    model: getModel(),
    schema: photoSchemas.photoRecipeResultSchema,
    temperature: 0.3,
    system: renderPrompt(
      assessment.sourceType === "recipe_card"
        ? "photo-card-complete"
        : "photo-dish-generate",
      {},
    ),
    messages: photoMessage(
      JSON.stringify({ ...context, sourceAssessment: assessment }),
    ),
  });
  const output = photoSchemas.photoRecipeResultSchema.parse(
    normalized(generated.object),
  );
  let recipe = output.recipe;
  const verification: Record<string, unknown> = {
    sourceAssessment: assessment,
    assumptions: output.assumptions,
  };
  console.log(
    JSON.stringify({
      stage: "generation",
      title: recipe.title,
      minutes: recipe.minutes,
      ingredients: recipe.ingredients.length,
      equipment: recipe.equipment.length,
      steps: recipe.steps.length,
      assumptions: output.assumptions,
    }),
  );

  async function verify(stage: "initial" | "final") {
    const findings = validators.photoRecipeCompletenessFindings(
      recipe,
      assessment.sourceType,
    );
    const result = await measuredGenerate(`eval-photo-${stage}-verification`, {
      model: getModel(),
      schema: verificationSchemas.independentVerificationSchema,
      temperature: 0,
      system: renderPrompt("recipe-verify", {}),
      messages: photoMessage(
        JSON.stringify({
          recipe,
          stage,
          profile,
          request: context.request,
          sourceAssessment: assessment,
          assumptions: output.assumptions,
          completenessFindings: findings,
        }),
      ),
    });
    const report = validators.applyPhotoCompleteness(
      verificationSchemas.independentVerificationSchema.parse(result.object),
      findings,
    );
    verification[`verification_${stage}`] = report;
    console.log(
      JSON.stringify({
        stage: `${stage}_verification`,
        verdict: report.verdict,
        summary: report.summary,
        findings: report.findings,
      }),
    );
    return report.verdict;
  }

  async function adjudicate() {
    const result = await measuredGenerate("eval-photo-adjudication", {
      model: getModel(),
      schema: verificationSchemas.adjudicationSchema,
      temperature: 0,
      system: renderPrompt("recipe-adjudicate", {}),
      prompt: JSON.stringify({
        recipe,
        verification,
        profile,
        request: context.request,
      }),
    });
    const decision = verificationSchemas.adjudicationSchema.parse(
      normalized(result.object),
    );
    verification.adjudication = decision;
    console.log(
      JSON.stringify({
        stage: "adjudication",
        verdict: decision.verdict,
        summary: decision.summary,
      }),
    );
    if (decision.verdict === "revise") {
      if (!decision.revisedRecipe) throw new Error("Revision missing recipe");
      recipe = decision.revisedRecipe;
    }
    return decision.verdict;
  }

  if ((await verify("initial")) === "block") process.exit(1);
  let revisions = 0;
  const firstEdit = await adjudicate();
  if (firstEdit === "block") process.exit(1);
  if (firstEdit === "revise") revisions += 1;
  let finalVerdict = await verify("final");
  if (finalVerdict === "revise" && revisions === 0) {
    const secondEdit = await adjudicate();
    if (secondEdit === "revise") {
      revisions += 1;
      finalVerdict = await verify("final");
    }
  }
  const remaining = validators.photoRecipeCompletenessFindings(
    recipe,
    assessment.sourceType,
  );
  console.log(
    JSON.stringify({
      stage: "result",
      title: recipe.title,
      verdict: finalVerdict,
      revisions,
      remaining,
      poultrySafety: recipe.steps.some((step) =>
        /74\s*°?\s*C|165\s*°?\s*F/i.test(step.instruction),
      ),
    }),
  );
  if (finalVerdict !== "pass" || remaining.length) process.exit(1);
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Photo evaluation failed",
  );
  process.exitCode = 1;
});
