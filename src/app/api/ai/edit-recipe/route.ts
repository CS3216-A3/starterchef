import { generateText, stepCountIs } from "ai";
import { z } from "zod";
import { getModel } from "@/lib/ai/model";
import { renderPrompt } from "@/lib/ai/prompts";
import { AI_OPERATION_COSTS, withAiRoute } from "@/lib/ai/route";
import {
  createRecipeEditTools,
  type EditableRecipe,
} from "@/lib/ai/recipe-edit-tools";

const requestSchema = z.object({
  request: z.string().min(1).max(1000),
  recipe: z.object({
    title: z.string(),
    description: z.string().default(""),
    minutes: z.number(),
    difficulty: z.enum(["easy", "medium", "hard"]),
    servings: z.number(),
    ingredients: z.array(z.string()),
    equipment: z.array(z.string()),
    steps: z.array(
      z.object({
        index: z.number(),
        title: z.string(),
        instruction: z.string(),
        durationSeconds: z.number().optional(),
        ingredients: z.array(z.string()),
        tip: z.string().optional(),
        photoCheckpoint: z.string().optional(),
      }),
    ),
    tags: z.array(z.string()).default([]),
    why_good: z.string().default(""),
  }),
});

/**
 * POST /api/ai/edit-recipe
 * Tool-driven recipe editing: the model mutates a server-side working copy
 * through constrained tools (updateMeta/setIngredients/updateStep/...) so
 * the result is always a valid recipe — no hallucinated free-form JSON.
 * Returns the full edited recipe + a changeSummary. Nothing is persisted;
 * the client applies or dismisses the suggestion.
 */
export const POST = withAiRoute({
  schema: requestSchema,
  cost: AI_OPERATION_COSTS.edit,
  async loadContext({ supabase, user }) {
    const { data, error } = await supabase
      .from("profiles")
      .select("dietary_restrictions, allergies, skill_level, household_size")
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw new Error("Could not load profile");
    return data;
  },
  async handler({ input, trusted: profile }) {
    const working: EditableRecipe = JSON.parse(JSON.stringify(input.recipe));
    const { tools, changes } = createRecipeEditTools(working);

    // Personalise edits: restrictions/allergies are hard constraints the
    // model must respect — and proactively fix — without being asked.
    const list = (v: string[] | null | undefined) =>
      v && v.length > 0 ? v.join(", ") : "none";

    const result = await generateText({
      model: getModel("edit"),
      tools,
      stopWhen: stepCountIs(12),
      temperature: 0.3,
      system: renderPrompt("edit-recipe", {
        dietaryRestrictions: list(profile?.dietary_restrictions),
        allergies: list(profile?.allergies),
        skillLevel: profile?.skill_level ?? "beginner",
        householdSize: String(profile?.household_size ?? 2),
      }),
      prompt: `Current recipe:\n${JSON.stringify(input.recipe, null, 1)}\n\nRequest: ${input.request}`,
      telemetry: { functionId: "edit-recipe" },
    });

    return Response.json({
      changeSummary:
        result.text?.trim() ||
        (changes.length ? changes.join(". ") : "No changes made."),
      title: working.title,
      description: working.description,
      minutes: working.minutes,
      difficulty: working.difficulty,
      servings: working.servings,
      ingredients: working.ingredients,
      equipment: working.equipment,
      steps: working.steps.map((s) => ({
        index: s.index,
        title: s.title,
        instruction: s.instruction,
        durationSeconds: s.durationSeconds,
        ingredientsUsed: s.ingredients,
        tip: s.tip,
        photoCheckpoint: s.photoCheckpoint,
      })),
      tags: working.tags,
      whyGood: working.why_good,
    });
  },
});
