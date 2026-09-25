import { FatalError } from "workflow";
import { measuredGenerate } from "@/lib/ai/instrument";
import {
  getGeminiVideoModel,
  getGeminiVideoModelName,
  getModel,
  getProvider,
  type AiProvider,
} from "@/lib/ai/model";
import { renderPrompt } from "@/lib/ai/prompts";
import { importedRecipeSchema } from "@/lib/ai/schemas/import";
import {
  photoRecipeResultSchema,
  photoSourceAssessmentSchema,
  type PhotoRecipeResult,
  type PhotoSourceAssessment,
} from "@/lib/ai/schemas/photo-recipe";
import {
  adjudicationSchema,
  independentVerificationSchema,
} from "@/lib/ai/schemas/recipe-verification";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadRecipeWebSource } from "@/lib/recipe-web-source";
import { workflowErrorChain, workflowErrorMessage } from "@/lib/workflow-error";
import { recipeSafetyFailure } from "@/lib/validation/recipe-safety";
import {
  applyPhotoCompleteness,
  photoRecipeCompletenessFindings,
  requirePhotoClarification,
} from "@/lib/validation/photo-recipe";

type Draft = {
  id: string;
  user_id: string;
  kind: "generated" | "photo" | "youtube" | "adapted" | "text" | "url";
  request: Record<string, unknown>;
  input_id: string | null;
  canonical_recipe: unknown;
  verification: Record<string, unknown>;
  retry_count: number;
  workflow_attempt_id: string;
  tailoring_source: unknown;
  tailoring_intent: string | null;
};

type RecipeVerificationRouting = "single" | "cross-provider";

const SOURCE_UNREADABLE_MESSAGE = "Recipe source could not be read";

/**
 * Single-provider verification is the safe operational default: it keeps a
 * review within the provider selected by AI_PROVIDER. Set this explicitly to
 * cross-provider only when both provider keys and the independent-verifier
 * operational cost are intended.
 */
function getRecipeVerificationRouting(): RecipeVerificationRouting {
  const value = process.env.RECIPE_VERIFICATION_ROUTING ?? "single";
  if (value === "single" || value === "cross-provider") return value;
  throw new Error(
    'Unsupported RECIPE_VERIFICATION_ROUTING. Expected "single" or "cross-provider".',
  );
}

function providerForStage(
  stage: "generation" | "verification" | "adjudication",
) {
  if (getRecipeVerificationRouting() === "single") return getProvider();
  if (stage === "verification") return "google" as const;
  return "openai" as const;
}

function credentialName(provider: AiProvider) {
  return provider === "openai"
    ? "OPENAI_API_KEY"
    : "GOOGLE_GENERATIVE_AI_API_KEY";
}

function hasCredential(provider: AiProvider) {
  return provider === "openai"
    ? Boolean(process.env.OPENAI_API_KEY)
    : Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

export async function recipeVerificationWorkflow(
  draftId: string,
  attemptId: string,
) {
  "use workflow";
  let claimed = false;
  try {
    await claimDraft(draftId, attemptId);
    claimed = true;
    const acquired = await acquireOrGenerateRecipe(draftId, attemptId);
    if (acquired === "awaiting_user_input") return;
    await deterministicGuard(draftId, "before_verification", attemptId);
    await verifyRecipe(draftId, "initial", attemptId);
    await adjudicate(draftId, attemptId);
    await deterministicGuard(draftId, "after_adjudication", attemptId);
    const finalVerdict = await verifyRecipe(draftId, "final", attemptId);
    if (finalVerdict === "revise") {
      if (!(await finalRevisionAvailable(draftId, attemptId))) {
        await failUnresolvedFinalRevision(draftId, attemptId);
        throw new FatalError("Final verifier requested a second revision");
      }
      await adjudicate(draftId, attemptId);
      await deterministicGuard(draftId, "after_final_revision", attemptId);
      const revisedFinalVerdict = await verifyRecipe(
        draftId,
        "final",
        attemptId,
      );
      if (revisedFinalVerdict !== "pass") {
        await failUnresolvedFinalRevision(draftId, attemptId);
        throw new FatalError("Final recipe revision did not pass verification");
      }
    }
    await finalizeDraft(draftId, attemptId);
  } catch (error) {
    if (claimed) {
      await recordWorkflowFailure(
        draftId,
        workflowErrorMessage(error),
        attemptId,
      );
    }
    // State has been persisted safely, but a failed Workflow must remain
    // visible to Vercel observability instead of being reported as success.
    throw error;
  }
}

async function claimDraft(draftId: string, attemptId: string) {
  "use step";
  logWorkflowEvent("recipe_workflow_step_started", draftId, {
    stage: "acquiring_source",
  });
  const admin = createAdminClient();
  const { data } = await admin
    .from("recipe_drafts")
    .select("id,status,kind,workflow_attempt_id")
    .eq("id", draftId)
    .maybeSingle();
  if (!data) throw new FatalError("Draft not found");
  // `queued` is the worker lease. A duplicate Vercel delivery must stop here
  // before it can make a model call or overwrite the active attempt.
  if (data.status !== "queued" || data.workflow_attempt_id !== attemptId)
    throw new FatalError(
      "Draft has already been claimed by a workflow attempt",
    );
  if (
    ["accepted", "rejected", "blocked", "failed_permanent"].includes(
      data.status,
    )
  )
    throw new FatalError("Draft is terminal");
  const routing = getRecipeVerificationRouting();
  const providers =
    routing === "cross-provider"
      ? (["openai", "google"] as const)
      : [getProvider()];
  // Public YouTube video input is intentionally Gemini-only. Verification
  // after extraction still follows RECIPE_VERIFICATION_ROUTING, preserving
  // the selectable single- and cross-provider review policies.
  const requiredProviders = Array.from(
    new Set<AiProvider>([
      ...providers,
      ...(data.kind === "youtube" ? (["google"] as const) : []),
    ]),
  );
  const missing = requiredProviders
    .filter((provider) => !hasCredential(provider))
    .map(credentialName);
  if (missing.length) {
    await admin
      .from("recipe_drafts")
      .update({
        status: "failed_retryable",
        failure_code:
          data.kind === "youtube" &&
          missing.includes("GOOGLE_GENERATIVE_AI_API_KEY")
            ? "GEMINI_VIDEO_PROVIDER_NOT_CONFIGURED"
            : routing === "cross-provider"
              ? missing.includes("GOOGLE_GENERATIVE_AI_API_KEY")
                ? "GEMINI_PROVIDER_NOT_CONFIGURED"
                : "OPENAI_PROVIDER_NOT_CONFIGURED"
              : "SELECTED_PROVIDER_NOT_CONFIGURED",
        verification: {
          summary:
            data.kind === "youtube" &&
            missing.includes("GOOGLE_GENERATIVE_AI_API_KEY")
              ? "YouTube recipe extraction uses Gemini. Configure GOOGLE_GENERATIVE_AI_API_KEY on the server, then retry this review."
              : `Recipe verification needs ${missing.join(" and ")} configured on the server for ${routing} routing.`,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", draftId)
      .eq("workflow_attempt_id", attemptId);
    throw new FatalError("Recipe verification provider is not configured");
  }
  const { data: claimed } = await admin
    .from("recipe_drafts")
    .update({
      status: "acquiring_source",
      failure_code: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId)
    .eq("status", "queued")
    .eq("workflow_attempt_id", attemptId)
    .select("id")
    .maybeSingle();
  if (!claimed)
    throw new FatalError(
      "Draft has already been claimed by a workflow attempt",
    );
}

async function acquireOrGenerateRecipe(
  draftId: string,
  attemptId: string,
): Promise<"ready" | "awaiting_user_input"> {
  "use step";
  logWorkflowEvent("recipe_workflow_step_started", draftId, {
    stage: "extracting_or_generating",
  });
  const admin = createAdminClient();
  const draft = await loadDraft(admin, draftId, attemptId);
  if (draft.canonical_recipe) return "ready";
  await admin
    .from("recipe_drafts")
    .update({
      status: "extracting_or_generating",
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId)
    .eq("workflow_attempt_id", attemptId);
  const [{ data: profile }, { data: pantry }] = await Promise.all([
    admin
      .from("profiles")
      .select("dietary_restrictions,allergies,skill_level,household_size")
      .eq("id", draft.user_id)
      .maybeSingle(),
    admin
      .from("kitchen_items")
      .select("kind,name,quantity")
      .eq("user_id", draft.user_id),
  ]);
  const trustedContext = {
    request: draft.request,
    profile,
    pantry: pantry ?? [],
  };
  const context = JSON.stringify(trustedContext);
  const args = {
    schema: importedRecipeSchema,
    temperature: 0.3,
  };
  const generationProvider = providerForStage("generation");
  let recipe: unknown;
  let verification = draft.verification ?? {};
  if (draft.tailoring_source && draft.tailoring_intent) {
    const base = importedRecipeSchema.safeParse(draft.tailoring_source);
    if (!base.success) throw new FatalError("Tailoring source is invalid");
    recipe = (
      await measuredGenerate("recipe-tailoring", {
        ...args,
        model: getModel(generationProvider),
        system: renderPrompt("recipe-tailor", {}),
        prompt: JSON.stringify({
          ...trustedContext,
          sourceRecipe: base.data,
          tailoringIntent: draft.tailoring_intent,
        }),
      })
    ).object;
  } else if (draft.kind === "photo") {
    const photo = await loadPhoto(admin, draft);
    let assessment = photoSourceAssessmentSchema.safeParse(
      verification.sourceAssessment,
    ).data;
    if (!assessment) {
      const classified = (
        await measuredGenerate("recipe-photo-classification", {
          model: getModel(generationProvider),
          schema: photoSourceAssessmentSchema,
          temperature: 0,
          system: renderPrompt("photo-source-classify", {}),
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: context },
                { type: "file", data: photo.bytes, mediaType: photo.mimeType },
              ],
            },
          ],
        })
      ).object as PhotoSourceAssessment;
      assessment = requirePhotoClarification(classified, profile?.allergies);
      verification = { ...verification, sourceAssessment: assessment };
      if (assessment.clarificationQuestion) {
        // Never pause longer than the private image is retained. Reserve 15
        // minutes for the resumed verification pipeline.
        const deadline = new Date(
          new Date(photo.expiresAt).getTime() - 15 * 60_000,
        );
        if (deadline.getTime() <= Date.now()) {
          await block(
            admin,
            draftId,
            "PHOTO_CLARIFICATION_EXPIRED",
            "classification",
            verification,
            attemptId,
          );
          throw new FatalError("Photo clarification expired");
        }
        verification = {
          ...verification,
          clarificationExpiresAt: deadline.toISOString(),
        };
        const { data: paused } = await admin
          .from("recipe_drafts")
          .update({
            status: "awaiting_user_input",
            verification,
            clarification_expires_at: deadline.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", draftId)
          .eq("workflow_attempt_id", attemptId)
          .eq("status", "extracting_or_generating")
          .select("id")
          .maybeSingle();
        if (!paused)
          throw new FatalError("Photo draft changed during classification");
        return "awaiting_user_input";
      }
    }
    const photoResult = (
      await measuredGenerate("recipe-photo-generation", {
        model: getModel(generationProvider),
        schema: photoRecipeResultSchema,
        temperature: 0.3,
        system: renderPrompt(
          assessment.sourceType === "recipe_card"
            ? "photo-card-complete"
            : "photo-dish-generate",
          {},
        ),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ...trustedContext,
                  sourceAssessment: assessment,
                }),
              },
              { type: "file", data: photo.bytes, mediaType: photo.mimeType },
            ],
          },
        ],
      })
    ).object as PhotoRecipeResult;
    recipe = photoResult.recipe;
    verification = { ...verification, assumptions: photoResult.assumptions };
  } else if (draft.kind === "youtube") {
    const url = requiredRequestString(draft.request, "url");
    recipe = (
      await measuredGenerate(
        "recipe-youtube-extraction",
        {
          ...args,
          system: renderPrompt("import-recipe", {}),
          // Gemini Interactions is Google's documented endpoint for direct,
          // public YouTube video URLs. Agentic processing lets Gemini inspect
          // the relevant recipe moments instead of sampling the whole video at
          // a fixed rate.
          model: getGeminiVideoModel(),
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `${context}\nExtract the recipe from this YouTube cooking video. Use its spoken and on-screen instructions.`,
                },
                {
                  type: "file",
                  data: { type: "url", url: new URL(url) },
                  mediaType: "video/mp4",
                  providerOptions: { google: { processing: "agentic" } },
                },
              ],
            },
          ],
        },
        {
          provider: "google",
          model: getGeminiVideoModelName(),
        },
      )
    ).object;
  } else {
    let adaptedSource: unknown = null;
    if (draft.kind === "adapted") {
      const recipeId = requiredRequestString(draft.request, "recipeId");
      const { data: parent } = await admin
        .from("recipes")
        .select(
          "title,description,minutes,difficulty,servings,ingredients,equipment,steps,tags,why_good",
        )
        .eq("id", recipeId)
        .or(`user_id.is.null,user_id.eq.${draft.user_id}`)
        .maybeSingle();
      if (!parent) throw new FatalError("Adaptation source recipe not found");
      adaptedSource = {
        recipe: parent,
        intent: requiredRequestString(draft.request, "intent"),
      };
    }
    const source =
      draft.kind === "text"
        ? requiredRequestString(draft.request, "content")
        : draft.kind === "url"
          ? await loadRecipeWebSource(
              requiredRequestString(draft.request, "url"),
            ).catch((error: unknown) => {
              // Blocked, missing, or non-recipe pages won't succeed on a
              // workflow retry; tag them so the UI can suggest the Text tab.
              // The reason is our own fetch/parse message (e.g. "Could not
              // fetch recipe page (403)"), never page content. It rides on
              // the FatalError so it lands in the workflow run log too.
              const reason = workflowErrorChain(error, "unknown");
              logWorkflowEvent("recipe_source_unreadable", draftId, { reason });
              throw new FatalError(`${SOURCE_UNREADABLE_MESSAGE}: ${reason}`);
            })
          : draft.kind === "adapted"
            ? JSON.stringify({ ...trustedContext, adaptation: adaptedSource })
            : context;
    recipe = (
      await measuredGenerate("recipe-generation", {
        ...args,
        system: renderPrompt(
          draft.kind === "text" || draft.kind === "url"
            ? "import-recipe"
            : "recipe-generate",
          {},
        ),
        model: getModel(generationProvider),
        prompt:
          draft.kind === "text" || draft.kind === "url"
            ? JSON.stringify({ context, source })
            : source,
      })
    ).object;
  }
  const canonicalRecipe = canonicalRecipeForStorage(recipe);
  if (!canonicalRecipe) throw new FatalError("Recipe schema validation failed");
  await admin
    .from("recipe_drafts")
    .update({
      canonical_recipe: canonicalRecipe,
      verification,
      status: "verifying",
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId)
    .eq("workflow_attempt_id", attemptId);
  return "ready";
}

async function loadPhoto(
  admin: ReturnType<typeof createAdminClient>,
  draft: Draft,
) {
  if (!draft.input_id) throw new FatalError("Photo draft has no input");
  const { data: input } = await admin
    .from("recipe_inputs")
    .select("object_path,mime_type,expires_at")
    .eq("id", draft.input_id)
    .eq("user_id", draft.user_id)
    .maybeSingle();
  if (!input || new Date(input.expires_at).getTime() <= Date.now())
    throw new FatalError("Private recipe input has expired");
  const download = await admin.storage
    .from("recipe-inputs")
    .download(input.object_path);
  if (download.error) throw new Error("Private recipe input is unavailable");
  return {
    bytes: new Uint8Array(await download.data.arrayBuffer()),
    mimeType: input.mime_type,
    expiresAt: input.expires_at,
  };
}

function requiredRequestString(request: Record<string, unknown>, key: string) {
  const value = request[key];
  if (typeof value !== "string" || !value.trim())
    throw new FatalError(`Draft is missing ${key}`);
  return value;
}

async function deterministicGuard(
  draftId: string,
  phase: string,
  attemptId: string,
) {
  "use step";
  logWorkflowEvent("recipe_workflow_step_started", draftId, {
    stage: `deterministic_guard_${phase}`,
  });
  const admin = createAdminClient();
  const draft = await loadDraft(admin, draftId, attemptId);
  const recipe = importedRecipeSchema.safeParse(draft.canonical_recipe);
  if (
    !recipe.success ||
    recipe.data.minutes > 480 ||
    recipe.data.servings > 24 ||
    recipe.data.steps.length > 30
  ) {
    await block(
      admin,
      draftId,
      "DETERMINISTIC_RECIPE_INVALID",
      phase,
      undefined,
      attemptId,
    );
    throw new FatalError("Invalid recipe");
  }
  const { data: profile } = await admin
    .from("profiles")
    .select("dietary_restrictions,allergies")
    .eq("id", draft.user_id)
    .maybeSingle();
  const safetyFailure = recipeSafetyFailure(recipe.data, profile);
  if (safetyFailure) {
    await block(admin, draftId, safetyFailure, phase, undefined, attemptId);
    throw new FatalError("Recipe failed deterministic safety validation");
  }
}

async function verifyRecipe(
  draftId: string,
  stage: "initial" | "final",
  attemptId: string,
): Promise<"pass" | "revise" | "block"> {
  "use step";
  const verificationProvider = providerForStage("verification");
  logWorkflowEvent("recipe_workflow_step_started", draftId, {
    stage: `${verificationProvider}_${stage}_verification`,
  });
  const admin = createAdminClient();
  const draft = await loadDraft(admin, draftId, attemptId);
  const [{ data: profile }, parsedRecipe] = await Promise.all([
    admin
      .from("profiles")
      .select("dietary_restrictions,allergies")
      .eq("id", draft.user_id)
      .maybeSingle(),
    Promise.resolve(importedRecipeSchema.safeParse(draft.canonical_recipe)),
  ]);
  const assessment = photoSourceAssessmentSchema.safeParse(
    draft.verification?.sourceAssessment,
  ).data;
  const completenessFindings = parsedRecipe.success
    ? photoRecipeCompletenessFindings(parsedRecipe.data, assessment?.sourceType)
    : [];
  const prompt = JSON.stringify({
    recipe: draft.canonical_recipe,
    stage,
    profile,
    request: draft.kind === "photo" ? draft.request : null,
    sourceAssessment: assessment ?? null,
    assumptions: draft.verification?.assumptions ?? [],
    completenessFindings,
  });
  const photo = draft.kind === "photo" ? await loadPhoto(admin, draft) : null;
  const result = await measuredGenerate(`recipe-${stage}-verification`, {
    model: getModel(verificationProvider),
    schema: independentVerificationSchema,
    temperature: 0,
    system: renderPrompt("recipe-verify", {}),
    ...(photo
      ? {
          messages: [
            {
              role: "user" as const,
              content: [
                { type: "text" as const, text: prompt },
                {
                  type: "file" as const,
                  data: photo.bytes,
                  mediaType: photo.mimeType,
                },
              ],
            },
          ],
        }
      : { prompt }),
  });
  const report = independentVerificationSchema.parse(result.object);
  const effectiveReport =
    draft.kind === "photo"
      ? applyPhotoCompleteness(report, completenessFindings)
      : report;
  const verification = {
    ...(draft.verification ?? {}),
    [`verification_${stage}`]: effectiveReport,
  };
  await admin
    .from("recipe_drafts")
    .update({
      verification,
      status: "adjudicating",
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId)
    .eq("workflow_attempt_id", attemptId);
  const verdict = effectiveReport.verdict;
  if (verdict === "block") {
    await block(
      admin,
      draftId,
      stage === "initial"
        ? "INITIAL_INDEPENDENT_VERIFIER_BLOCKED"
        : "FINAL_INDEPENDENT_VERIFIER_FAILED",
      stage,
      verification,
      attemptId,
    );
    throw new FatalError(`${stage} independent verification failed`);
  }
  return verdict;
}

async function adjudicate(draftId: string, attemptId: string) {
  "use step";
  const adjudicationProvider = providerForStage("adjudication");
  logWorkflowEvent("recipe_workflow_step_started", draftId, {
    stage: `${adjudicationProvider}_adjudication`,
  });
  const admin = createAdminClient();
  const draft = await loadDraft(admin, draftId, attemptId);
  const { data: profile } = await admin
    .from("profiles")
    .select("dietary_restrictions,allergies")
    .eq("id", draft.user_id)
    .maybeSingle();
  const decision = await measuredGenerate("recipe-adjudication", {
    model: getModel(adjudicationProvider),
    schema: adjudicationSchema,
    temperature: 0,
    system: renderPrompt("recipe-adjudicate", {}),
    prompt: JSON.stringify({
      recipe: draft.canonical_recipe,
      verification: draft.verification,
      profile,
      request: draft.kind === "photo" ? draft.request : null,
    }),
  });
  const verification = {
    ...(draft.verification ?? {}),
    adjudication: decision.object,
  };
  const adjudication = decision.object as {
    verdict: string;
    revisedRecipe: unknown;
  };
  if (adjudication.verdict === "block") {
    await block(
      admin,
      draftId,
      "ADJUDICATION_BLOCKED",
      "adjudication",
      verification,
      attemptId,
    );
    throw new FatalError("Recipe blocked");
  }
  if (adjudication.verdict === "revise") {
    if (draft.retry_count >= 1) {
      await block(
        admin,
        draftId,
        "REVISION_LIMIT_REACHED",
        "adjudication",
        verification,
        attemptId,
      );
      throw new FatalError("Revision limit reached");
    }
    const revisedRecipe = canonicalRecipeForStorage(adjudication.revisedRecipe);
    if (!revisedRecipe) {
      await block(
        admin,
        draftId,
        "INVALID_REVISION",
        "adjudication",
        verification,
        attemptId,
      );
      throw new FatalError("Invalid revision");
    }
    await admin
      .from("recipe_drafts")
      .update({
        canonical_recipe: revisedRecipe,
        verification,
        retry_count: draft.retry_count + 1,
        status: "verifying",
        updated_at: new Date().toISOString(),
      })
      .eq("id", draftId)
      .eq("workflow_attempt_id", attemptId);
    return;
  }
  await admin
    .from("recipe_drafts")
    .update({
      verification,
      status: "verifying",
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId)
    .eq("workflow_attempt_id", attemptId);
}

async function finalizeDraft(draftId: string, attemptId: string) {
  "use step";
  logWorkflowEvent("recipe_workflow_step_started", draftId, {
    stage: "finalizing",
  });
  const admin = createAdminClient();
  const draft = await loadDraft(admin, draftId, attemptId);
  const final = (draft.verification?.verification_final ??
    draft.verification?.gemini_final) as { verdict?: string } | undefined;
  const parsedRecipe = importedRecipeSchema.safeParse(draft.canonical_recipe);
  const assessment = photoSourceAssessmentSchema.safeParse(
    draft.verification?.sourceAssessment,
  ).data;
  const completenessFindings =
    draft.kind === "photo" && parsedRecipe.success
      ? photoRecipeCompletenessFindings(
          parsedRecipe.data,
          assessment?.sourceType,
        )
      : [];
  if (completenessFindings.length) {
    await block(
      admin,
      draftId,
      "PHOTO_RECIPE_INCOMPLETE",
      "final",
      {
        ...draft.verification,
        photoCompleteness: {
          summary:
            "The generated recipe still needs corrections before it can be saved.",
          verdict: "block",
          findings: completenessFindings.map((message) => ({
            severity: "critical",
            category: "instruction",
            message,
          })),
        },
      },
      attemptId,
    );
    throw new FatalError("Photo recipe failed final completeness checks");
  }
  if (final?.verdict !== "pass") {
    await block(
      admin,
      draftId,
      "FINAL_INDEPENDENT_VERIFIER_FAILED",
      "final",
      undefined,
      attemptId,
    );
    throw new FatalError("Missing passing final verifier");
  }
  await admin
    .from("recipe_drafts")
    .update({
      status: "awaiting_user_acceptance",
      failure_code: null,
      verification: { ...draft.verification, verdict: "pass" },
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId)
    .eq("workflow_attempt_id", attemptId);
}

async function failUnresolvedFinalRevision(draftId: string, attemptId: string) {
  "use step";
  const admin = createAdminClient();
  const draft = await loadDraft(admin, draftId, attemptId);
  await block(
    admin,
    draftId,
    "FINAL_REVISION_UNRESOLVED",
    "final_revision",
    draft.verification,
    attemptId,
  );
}

async function finalRevisionAvailable(draftId: string, attemptId: string) {
  "use step";
  const admin = createAdminClient();
  const draft = await loadDraft(admin, draftId, attemptId);
  return draft.retry_count < 1;
}

async function loadDraft(
  admin: ReturnType<typeof createAdminClient>,
  draftId: string,
  attemptId: string,
): Promise<Draft> {
  const { data } = await admin
    .from("recipe_drafts")
    .select(
      "id,user_id,kind,request,input_id,canonical_recipe,verification,retry_count,workflow_attempt_id,status,tailoring_source,tailoring_intent",
    )
    .eq("id", draftId)
    .maybeSingle();
  if (!data) throw new FatalError("Draft not found");
  if (
    data.workflow_attempt_id !== attemptId ||
    [
      "accepted",
      "rejected",
      "blocked",
      "failed_permanent",
      "awaiting_user_input",
    ].includes(data.status)
  )
    throw new FatalError("Workflow attempt is no longer current");
  return data as Draft;
}

/**
 * The UI uses undefined for optional-looking recipe fields, while OpenAI
 * Structured Outputs requires every property to be present. Persist null for
 * those values so JSONB retains the complete strict-schema shape and every
 * later guard can validate the same canonical recipe.
 */
function canonicalRecipeForStorage(recipe: unknown) {
  const normalized = JSON.parse(
    JSON.stringify(recipe, (_key, value) =>
      value === undefined ? null : value,
    ),
  ) as unknown;
  return importedRecipeSchema.safeParse(normalized).success ? normalized : null;
}

async function block(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
  code: string,
  stage: string,
  verification?: Record<string, unknown>,
  attemptId?: string,
) {
  await admin
    .from("recipe_drafts")
    .update({
      status: "blocked",
      failure_code: code,
      verification: verification ?? { stage },
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq(
      "workflow_attempt_id",
      attemptId ?? "00000000-0000-0000-0000-000000000000",
    );
}

async function recordWorkflowFailure(
  draftId: string,
  message: string,
  attemptId: string,
) {
  "use step";
  const admin = createAdminClient();
  const { data: draft } = await admin
    .from("recipe_drafts")
    .select("status,failure_code,verification,workflow_attempt_id")
    .eq("id", draftId)
    .maybeSingle();
  // Deterministic guards already wrote a terminal safety verdict.
  if (
    !draft ||
    draft.workflow_attempt_id !== attemptId ||
    [
      "accepted",
      "rejected",
      "blocked",
      "failed_permanent",
      "awaiting_user_acceptance",
      "awaiting_user_input",
    ].includes(draft.status)
  )
    return;
  if (
    draft.status === "failed_retryable" &&
    [
      "GEMINI_PROVIDER_NOT_CONFIGURED",
      "GEMINI_VIDEO_PROVIDER_NOT_CONFIGURED",
      "OPENAI_PROVIDER_NOT_CONFIGURED",
      "SELECTED_PROVIDER_NOT_CONFIGURED",
    ].includes(draft.failure_code ?? "")
  )
    return;
  if (message === "Private recipe input has expired") {
    await admin
      .from("recipe_drafts")
      .update({
        status: "blocked",
        failure_code: "PHOTO_INPUT_EXPIRED",
        verification: {
          ...((draft.verification as Record<string, unknown>) ?? {}),
          summary: "The private photo expired before verification finished.",
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", draftId)
      .eq("workflow_attempt_id", attemptId);
    return;
  }
  const sourceUnreadable = message.startsWith(SOURCE_UNREADABLE_MESSAGE);
  const sourceError = message.startsWith(`${SOURCE_UNREADABLE_MESSAGE}: `)
    ? message.slice(SOURCE_UNREADABLE_MESSAGE.length + 2)
    : undefined;
  const temporary =
    !sourceUnreadable &&
    /high demand|rate limit|temporar|unavailable|retry/i.test(message);
  logWorkflowEvent("recipe_workflow_failed", draftId, {
    failureCategory: workflowFailureCategory(message),
  });
  await admin
    .from("recipe_drafts")
    .update({
      status: "failed_retryable",
      failure_code: sourceUnreadable
        ? "SOURCE_UNREADABLE"
        : temporary
          ? "PROVIDER_TEMPORARILY_UNAVAILABLE"
          : "WORKFLOW_FAILED",
      verification: {
        ...((draft.verification as Record<string, unknown>) ?? {}),
        summary: sourceUnreadable
          ? "We couldn't read a recipe from that link."
          : temporary
            ? "The AI provider is temporarily busy. You can retry this review without uploading the recipe again."
            : "Recipe verification could not finish. You can retry this review.",
        ...(sourceError ? { sourceError } : {}),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId)
    .eq("workflow_attempt_id", attemptId);
}

/** Logs opaque IDs and safe failure categories only: never prompts, source
 * media, provider responses, or credentials. These events are searchable in
 * Vercel logs alongside the Workflow step logs. */
function logWorkflowEvent(
  event: string,
  draftId: string,
  details: Record<string, string> = {},
) {
  console.info(JSON.stringify({ event, draftId, ...details }));
}

function workflowFailureCategory(error: unknown) {
  const message = workflowErrorMessage(error, "");
  if (message.startsWith(SOURCE_UNREADABLE_MESSAGE)) return "source_unreadable";
  if (/high demand|rate limit|temporar|unavailable|retry/i.test(message))
    return "provider_temporarily_unavailable";
  if (/api key|not configured|authentication|unauthorized/i.test(message))
    return "provider_configuration";
  if (/allowlist|model/i.test(message)) return "model_configuration";
  return "workflow_failed";
}
