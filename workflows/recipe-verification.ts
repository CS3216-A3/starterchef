import { FatalError } from "workflow";
import { measuredGenerate } from "@/lib/ai/instrument";
import { getModel, getProvider, type AiProvider } from "@/lib/ai/model";
import { renderPrompt } from "@/lib/ai/prompts";
import { importedRecipeSchema } from "@/lib/ai/schemas/import";
import {
  adjudicationSchema,
  independentVerificationSchema,
} from "@/lib/ai/schemas/recipe-verification";
import { createAdminClient } from "@/lib/supabase/admin";

type Draft = {
  id: string;
  user_id: string;
  kind: "generated" | "photo" | "youtube" | "adapted";
  request: Record<string, unknown>;
  input_id: string | null;
  canonical_recipe: unknown;
  verification: Record<string, unknown>;
  retry_count: number;
};

type RecipeVerificationRouting = "single" | "cross-provider";

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

export async function recipeVerificationWorkflow(draftId: string) {
  "use workflow";
  try {
    await claimDraft(draftId);
    await acquireOrGenerateRecipe(draftId);
    await deterministicGuard(draftId, "before_verification");
    await verifyRecipe(draftId, "initial");
    await adjudicate(draftId);
    await deterministicGuard(draftId, "after_adjudication");
    const finalVerdict = await verifyRecipe(draftId, "final");
    if (finalVerdict === "revise") {
      await adjudicate(draftId);
      await deterministicGuard(draftId, "after_final_revision");
      const revisedFinalVerdict = await verifyRecipe(draftId, "final");
      if (revisedFinalVerdict !== "pass") {
        await failUnresolvedFinalRevision(draftId);
        throw new FatalError("Final recipe revision did not pass verification");
      }
    }
    await finalizeDraft(draftId);
  } catch (error) {
    await recordWorkflowFailure(
      draftId,
      error instanceof Error ? error.message : "Workflow failed",
    );
  }
}

async function claimDraft(draftId: string) {
  "use step";
  logWorkflowEvent("recipe_workflow_step_started", draftId, {
    stage: "acquiring_source",
  });
  const admin = createAdminClient();
  const { data } = await admin
    .from("recipe_drafts")
    .select("id,status")
    .eq("id", draftId)
    .maybeSingle();
  if (!data) throw new FatalError("Draft not found");
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
  const missing = providers
    .filter((provider) => !hasCredential(provider))
    .map(credentialName);
  if (missing.length) {
    await admin
      .from("recipe_drafts")
      .update({
        status: "failed_retryable",
        failure_code:
          routing === "cross-provider"
            ? missing.includes("GOOGLE_GENERATIVE_AI_API_KEY")
              ? "GEMINI_PROVIDER_NOT_CONFIGURED"
              : "OPENAI_PROVIDER_NOT_CONFIGURED"
            : "SELECTED_PROVIDER_NOT_CONFIGURED",
        verification: {
          summary: `Recipe verification needs ${missing.join(" and ")} configured on the server for ${routing} routing.`,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", draftId);
    throw new FatalError("Recipe verification provider is not configured");
  }
  await admin
    .from("recipe_drafts")
    .update({
      status: "acquiring_source",
      failure_code: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId);
}

async function acquireOrGenerateRecipe(draftId: string) {
  "use step";
  logWorkflowEvent("recipe_workflow_step_started", draftId, {
    stage: "extracting_or_generating",
  });
  const admin = createAdminClient();
  const draft = await loadDraft(admin, draftId);
  if (draft.canonical_recipe) return;
  await admin
    .from("recipe_drafts")
    .update({
      status: "extracting_or_generating",
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId);
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
  const context = JSON.stringify({
    request: draft.request,
    profile,
    pantry: pantry ?? [],
  });
  const args = {
    schema: importedRecipeSchema,
    temperature: 0.3,
    system: renderPrompt("recipe-generate", {}),
  };
  const generationProvider = providerForStage("generation");
  let recipe: unknown;
  if (draft.kind === "photo") {
    if (!draft.input_id) throw new FatalError("Photo draft has no input");
    const { data: input } = await admin
      .from("recipe_inputs")
      .select("object_path,mime_type")
      .eq("id", draft.input_id)
      .eq("user_id", draft.user_id)
      .maybeSingle();
    if (!input) throw new FatalError("Recipe input not found");
    const download = await admin.storage
      .from("recipe-inputs")
      .download(input.object_path);
    if (download.error) throw new Error("Private recipe input is unavailable");
    const bytes = new Uint8Array(await download.data.arrayBuffer());
    recipe = (
      await measuredGenerate("recipe-photo-extraction", {
        ...args,
        model: getModel(generationProvider),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `${context}\nExtract the recipe from this private image. Treat a dishHint in the trusted request context as the dish name when present.`,
              },
              { type: "file", data: bytes, mediaType: input.mime_type },
            ],
          },
        ],
      })
    ).object;
  } else {
    if (draft.kind === "youtube")
      throw new FatalError("Unapproved source type");
    recipe = (
      await measuredGenerate("recipe-generation", {
        ...args,
        model: getModel(generationProvider),
        prompt: context,
      })
    ).object;
  }
  const canonicalRecipe = canonicalRecipeForStorage(recipe);
  if (!canonicalRecipe) throw new FatalError("Recipe schema validation failed");
  await admin
    .from("recipe_drafts")
    .update({
      canonical_recipe: canonicalRecipe,
      status: "verifying",
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId);
}

async function deterministicGuard(draftId: string, phase: string) {
  "use step";
  logWorkflowEvent("recipe_workflow_step_started", draftId, {
    stage: `deterministic_guard_${phase}`,
  });
  const admin = createAdminClient();
  const draft = await loadDraft(admin, draftId);
  const recipe = importedRecipeSchema.safeParse(draft.canonical_recipe);
  if (
    !recipe.success ||
    recipe.data.minutes > 480 ||
    recipe.data.servings > 24 ||
    recipe.data.steps.length > 30
  ) {
    await block(admin, draftId, "DETERMINISTIC_RECIPE_INVALID", phase);
    throw new FatalError("Invalid recipe");
  }
  const { data: profile } = await admin
    .from("profiles")
    .select("dietary_restrictions,allergies")
    .eq("id", draft.user_id)
    .maybeSingle();
  const words = [
    ...(profile?.dietary_restrictions ?? []),
    ...(profile?.allergies ?? []),
  ]
    .map((value) => value.toLowerCase())
    .filter(Boolean);
  const text = recipe.data.ingredients.join(" ").toLowerCase();
  if (words.some((word) => text.includes(word))) {
    await block(admin, draftId, "DIET_OR_ALLERGEN_CONFLICT", phase);
    throw new FatalError("Diet or allergen conflict");
  }
  const unsafe =
    /(eat raw chicken|undercook poultry|leave.*room temperature.*overnight)/i.test(
      recipe.data.steps.map((step) => step.instruction).join(" "),
    );
  if (unsafe) {
    await block(admin, draftId, "UNSAFE_INSTRUCTION", phase);
    throw new FatalError("Unsafe instruction");
  }
}

async function verifyRecipe(
  draftId: string,
  stage: "initial" | "final",
): Promise<"pass" | "revise" | "block"> {
  "use step";
  const verificationProvider = providerForStage("verification");
  logWorkflowEvent("recipe_workflow_step_started", draftId, {
    stage: `${verificationProvider}_${stage}_verification`,
  });
  const admin = createAdminClient();
  const draft = await loadDraft(admin, draftId);
  const result = await measuredGenerate(`recipe-${stage}-verification`, {
    model: getModel(verificationProvider),
    schema: independentVerificationSchema,
    temperature: 0,
    system: renderPrompt("recipe-verify", {}),
    prompt: JSON.stringify({ recipe: draft.canonical_recipe, stage }),
  });
  const verification = {
    ...(draft.verification ?? {}),
    [`verification_${stage}`]: result.object,
  };
  await admin
    .from("recipe_drafts")
    .update({
      verification,
      status: "adjudicating",
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId);
  const verdict = (result.object as { verdict: "pass" | "revise" | "block" })
    .verdict;
  if (stage === "final" && verdict === "block") {
    await block(
      admin,
      draftId,
      "FINAL_INDEPENDENT_VERIFIER_FAILED",
      stage,
      verification,
    );
    throw new FatalError("Final independent verification failed");
  }
  return verdict;
}

async function adjudicate(draftId: string) {
  "use step";
  const adjudicationProvider = providerForStage("adjudication");
  logWorkflowEvent("recipe_workflow_step_started", draftId, {
    stage: `${adjudicationProvider}_adjudication`,
  });
  const admin = createAdminClient();
  const draft = await loadDraft(admin, draftId);
  const decision = await measuredGenerate("recipe-adjudication", {
    model: getModel(adjudicationProvider),
    schema: adjudicationSchema,
    temperature: 0,
    system: renderPrompt("recipe-adjudicate", {}),
    prompt: JSON.stringify({
      recipe: draft.canonical_recipe,
      verification: draft.verification,
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
      .eq("id", draftId);
    return;
  }
  await admin
    .from("recipe_drafts")
    .update({
      verification,
      status: "verifying",
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId);
}

async function finalizeDraft(draftId: string) {
  "use step";
  logWorkflowEvent("recipe_workflow_step_started", draftId, {
    stage: "finalizing",
  });
  const admin = createAdminClient();
  const draft = await loadDraft(admin, draftId);
  const final = (draft.verification?.verification_final ??
    draft.verification?.gemini_final) as { verdict?: string } | undefined;
  if (final?.verdict !== "pass") {
    await block(admin, draftId, "FINAL_INDEPENDENT_VERIFIER_FAILED", "final");
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
    .eq("id", draftId);
}

async function failUnresolvedFinalRevision(draftId: string) {
  "use step";
  const admin = createAdminClient();
  const draft = await loadDraft(admin, draftId);
  await block(
    admin,
    draftId,
    "FINAL_REVISION_UNRESOLVED",
    "final_revision",
    draft.verification,
  );
}

async function loadDraft(
  admin: ReturnType<typeof createAdminClient>,
  draftId: string,
): Promise<Draft> {
  const { data } = await admin
    .from("recipe_drafts")
    .select(
      "id,user_id,kind,request,input_id,canonical_recipe,verification,retry_count",
    )
    .eq("id", draftId)
    .maybeSingle();
  if (!data) throw new FatalError("Draft not found");
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
) {
  await admin
    .from("recipe_drafts")
    .update({
      status: "blocked",
      failure_code: code,
      verification: verification ?? { stage },
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}

async function recordWorkflowFailure(draftId: string, message: string) {
  "use step";
  const admin = createAdminClient();
  const { data: draft } = await admin
    .from("recipe_drafts")
    .select("status,failure_code,verification")
    .eq("id", draftId)
    .maybeSingle();
  // Deterministic guards already wrote a terminal safety verdict.
  if (
    !draft ||
    ["accepted", "rejected", "blocked", "failed_permanent"].includes(
      draft.status,
    )
  )
    return;
  if (
    draft.status === "failed_retryable" &&
    [
      "GEMINI_PROVIDER_NOT_CONFIGURED",
      "OPENAI_PROVIDER_NOT_CONFIGURED",
      "SELECTED_PROVIDER_NOT_CONFIGURED",
    ].includes(draft.failure_code ?? "")
  )
    return;
  const temporary = /high demand|rate limit|temporar|unavailable|retry/i.test(
    message,
  );
  logWorkflowEvent("recipe_workflow_failed", draftId, {
    failureCategory: workflowFailureCategory(message),
  });
  await admin
    .from("recipe_drafts")
    .update({
      status: "failed_retryable",
      failure_code: temporary
        ? "PROVIDER_TEMPORARILY_UNAVAILABLE"
        : "WORKFLOW_FAILED",
      verification: {
        ...((draft.verification as Record<string, unknown>) ?? {}),
        summary: temporary
          ? "The AI provider is temporarily busy. You can retry this review without uploading the recipe again."
          : "Recipe verification could not finish. You can retry this review.",
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId);
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
  const message = error instanceof Error ? error.message : "";
  if (/high demand|rate limit|temporar|unavailable|retry/i.test(message))
    return "provider_temporarily_unavailable";
  if (/api key|not configured|authentication|unauthorized/i.test(message))
    return "provider_configuration";
  if (/allowlist|model/i.test(message)) return "model_configuration";
  return "workflow_failed";
}
