import { tool } from "ai";
import { z } from "zod";
import type { RecipeStep } from "@/lib/types";

/**
 * Tools for AI-driven recipe editing. Instead of asking the model to emit a
 * whole recipe (and hoping the format is right), each tool mutates a working
 * copy server-side — so the persisted recipe can only ever be built from
 * well-formed edits. Returns the mutated recipe + human-readable change notes.
 */

export interface EditableRecipe {
  title: string;
  description: string;
  minutes: number;
  difficulty: "easy" | "medium" | "hard";
  servings: number;
  ingredients: string[];
  equipment: string[];
  steps: RecipeStep[];
  tags: string[];
  why_good: string;
}

const stepInput = z.object({
  index: z.number().int().min(1).describe("Step number to edit"),
  title: z.string().optional(),
  instruction: z.string().optional(),
  durationSeconds: z.number().int().positive().optional(),
  ingredients: z
    .array(z.string())
    .optional()
    .describe("Ingredients used in this step"),
  tip: z.string().optional(),
});

export function createRecipeEditTools(recipe: EditableRecipe) {
  const changes: string[] = [];

  function stepAt(index: number): RecipeStep | undefined {
    return recipe.steps.find((s) => s.index === index);
  }

  const tools = {
    updateMeta: tool({
      description:
        "Update recipe-level fields: title, description, total minutes, difficulty, servings, tags.",
      inputSchema: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        minutes: z.number().int().positive().optional(),
        difficulty: z.enum(["easy", "medium", "hard"]).optional(),
        servings: z.number().int().positive().optional(),
        tags: z.array(z.string()).optional(),
      }),
      execute: async (input) => {
        const applied: string[] = [];
        if (input.title !== undefined) {
          recipe.title = input.title;
          applied.push("title");
        }
        if (input.description !== undefined) {
          recipe.description = input.description;
          applied.push("description");
        }
        if (input.minutes !== undefined) {
          recipe.minutes = input.minutes;
          applied.push(`time to ${input.minutes} min`);
        }
        if (input.difficulty !== undefined) {
          recipe.difficulty = input.difficulty;
          applied.push(`difficulty to ${input.difficulty}`);
        }
        if (input.servings !== undefined) {
          applied.push(`servings ${recipe.servings} → ${input.servings}`);
          recipe.servings = input.servings;
        }
        if (input.tags !== undefined) {
          recipe.tags = input.tags;
          applied.push("tags");
        }
        changes.push(`Updated ${applied.join(", ")}`);
        return { applied };
      },
    }),

    setIngredients: tool({
      description:
        "Replace the full ingredient list. Use when scaling servings or substituting — always supply the complete new list with quantities.",
      inputSchema: z.object({
        ingredients: z.array(z.string()).min(1),
      }),
      execute: async ({ ingredients }) => {
        recipe.ingredients = ingredients;
        changes.push(`Updated ingredient list (${ingredients.length} items)`);
        return { count: ingredients.length };
      },
    }),

    setEquipment: tool({
      description: "Replace the equipment list.",
      inputSchema: z.object({ equipment: z.array(z.string()) }),
      execute: async ({ equipment }) => {
        recipe.equipment = equipment;
        changes.push(`Updated equipment list (${equipment.length} items)`);
        return { count: equipment.length };
      },
    }),

    updateStep: tool({
      description:
        "Edit fields of one step by its index. Only provided fields change.",
      inputSchema: stepInput,
      execute: async (input) => {
        const step = stepAt(input.index);
        if (!step) return { error: `No step ${input.index}` };
        if (input.title !== undefined) step.title = input.title;
        if (input.instruction !== undefined)
          step.instruction = input.instruction;
        if (input.durationSeconds !== undefined)
          step.durationSeconds = input.durationSeconds;
        if (input.ingredients !== undefined)
          step.ingredients = input.ingredients;
        if (input.tip !== undefined) step.tip = input.tip;
        changes.push(`Updated step ${input.index}`);
        return { updated: input.index };
      },
    }),

    addStep: tool({
      description:
        "Insert a new step at a position. Later steps are renumbered automatically.",
      inputSchema: stepInput.extend({
        title: z.string(),
        instruction: z.string(),
      }),
      execute: async (input) => {
        const step: RecipeStep = {
          index: input.index,
          title: input.title,
          instruction: input.instruction,
          durationSeconds: input.durationSeconds,
          ingredients: input.ingredients ?? [],
          tip: input.tip,
        };
        recipe.steps = recipe.steps
          .map((s) =>
            s.index >= input.index ? { ...s, index: s.index + 1 } : s,
          )
          .concat(step)
          .sort((a, b) => a.index - b.index);
        changes.push(`Added step ${input.index}: ${input.title}`);
        return { inserted: input.index };
      },
    }),

    removeStep: tool({
      description: "Remove a step by index. Later steps are renumbered.",
      inputSchema: z.object({ index: z.number().int().min(1) }),
      execute: async ({ index }) => {
        if (!stepAt(index)) return { error: `No step ${index}` };
        recipe.steps = recipe.steps
          .filter((s) => s.index !== index)
          .map((s, i) => ({ ...s, index: i + 1 }));
        changes.push(`Removed step ${index}`);
        return { removed: index };
      },
    }),
  };

  return { tools, changes };
}
