import { FatalError } from "workflow";
import { measuredGenerate } from "@/lib/ai/instrument";
import { getModel } from "@/lib/ai/model";
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

export async function recipeVerificationWorkflow(draftId: string) {
  "use workflow";
  await claimDraft(draftId);
  await acquireOrGenerateRecipe(draftId);
  await deterministicGuard(draftId, "before_verification");
  await geminiVerify(draftId, "initial");
  await adjudicate(draftId);
  await deterministicGuard(draftId, "after_adjudication");
  await geminiVerify(draftId, "final");
  await finalizeDraft(draftId);
}

async function claimDraft(draftId: string) {
  "use step";
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
        model: getModel("google"),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `${context}\nExtract the recipe from this private image.`,
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
        model: getModel("openai"),
        prompt: context,
      })
    ).object;
  }
  const parsed = importedRecipeSchema.safeParse(recipe);
  if (!parsed.success) throw new FatalError("Recipe schema validation failed");
  await admin
    .from("recipe_drafts")
    .update({
      canonical_recipe: parsed.data,
      status: "verifying",
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId);
}

async function deterministicGuard(draftId: string, phase: string) {
  "use step";
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

async function geminiVerify(draftId: string, stage: "initial" | "final") {
  "use step";
  const admin = createAdminClient();
  const draft = await loadDraft(admin, draftId);
  const result = await measuredGenerate(`recipe-gemini-${stage}-verification`, {
    model: getModel("google"),
    schema: independentVerificationSchema,
    temperature: 0,
    system: renderPrompt("recipe-verify", {}),
    prompt: JSON.stringify({ recipe: draft.canonical_recipe, stage }),
  });
  const verification = {
    ...(draft.verification ?? {}),
    [`gemini_${stage}`]: result.object,
  };
  await admin
    .from("recipe_drafts")
    .update({
      verification,
      status: "adjudicating",
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId);
  const verdict = (result.object as { verdict: string }).verdict;
  if (stage === "final" && verdict !== "pass") {
    await block(
      admin,
      draftId,
      "FINAL_INDEPENDENT_VERIFIER_FAILED",
      stage,
      verification,
    );
    throw new FatalError("Final independent verification failed");
  }
}

async function adjudicate(draftId: string) {
  "use step";
  const admin = createAdminClient();
  const draft = await loadDraft(admin, draftId);
  const decision = await measuredGenerate("recipe-openai-adjudication", {
    model: getModel("openai"),
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
    const revised = importedRecipeSchema.safeParse(adjudication.revisedRecipe);
    if (!revised.success) {
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
        canonical_recipe: revised.data,
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
  const admin = createAdminClient();
  const draft = await loadDraft(admin, draftId);
  const final = draft.verification?.gemini_final as
    { verdict?: string } | undefined;
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
