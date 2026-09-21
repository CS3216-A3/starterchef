import { tool } from "ai";
import { z } from "zod";
import { mockEquipment, mockIngredients } from "@/lib/mock-data";

/**
 * Tools available to the cooking assistant agent. `execute` functions are
 * stubs backed by mock data until Supabase is wired in — the tool surface is
 * what matters for the agentic-pattern milestone.
 */
export const cookingTools = {
  getInventory: tool({
    description:
      "Get the user's current kitchen inventory: ingredients and equipment.",
    inputSchema: z.object({}),
    execute: async () => ({
      ingredients: mockIngredients,
      equipment: mockEquipment,
    }),
  }),

  substituteIngredient: tool({
    description:
      "Find a substitute for an ingredient the user is missing or avoiding.",
    inputSchema: z.object({
      ingredient: z.string(),
      reason: z
        .enum(["missing", "allergy", "dislike", "dietary"])
        .default("missing"),
    }),
    execute: async ({ ingredient, reason }) => ({
      ingredient,
      reason,
      // Placeholder — real substitutions come from the model + user history.
      suggestions: [],
    }),
  }),

  setTimer: tool({
    description: "Set a kitchen timer for the user.",
    inputSchema: z.object({
      seconds: z.number().int().positive(),
      label: z.string(),
    }),
    execute: async ({ seconds, label }) => ({
      started: true,
      seconds,
      label,
    }),
  }),

  getDietaryProfile: tool({
    description:
      "Get the user's dietary restrictions, allergies, and taste preferences.",
    inputSchema: z.object({}),
    execute: async () => ({
      dietaryRestrictions: [],
      allergies: [],
      skillLevel: "beginner",
    }),
  }),
};
