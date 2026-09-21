import { tool } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { KitchenItemRow, ProfileRow } from "@/lib/types";

/**
 * Tools available to the cooking assistant agent. `execute` runs server-side
 * inside the route handler, so the cookie-bound Supabase client works and
 * RLS scopes every query to the calling user.
 */
export const cookingTools = {
  getInventory: tool({
    description:
      "Get the user's current kitchen inventory: ingredients and equipment.",
    inputSchema: z.object({}),
    execute: async () => {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { ingredients: [], equipment: [] };

      const { data } = await supabase
        .from("kitchen_items")
        .select("kind, name")
        .eq("user_id", user.id);
      const items = (data ?? []) as Pick<KitchenItemRow, "kind" | "name">[];
      return {
        ingredients: items
          .filter((i) => i.kind === "ingredient")
          .map((i) => i.name),
        equipment: items
          .filter((i) => i.kind === "equipment")
          .map((i) => i.name),
      };
    },
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
    execute: async () => {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return {
          dietaryRestrictions: [],
          allergies: [],
          skillLevel: "beginner",
        };
      }

      const { data } = await supabase
        .from("profiles")
        .select("dietary_restrictions, allergies, skill_level")
        .eq("id", user.id)
        .maybeSingle();
      const profile = data as Pick<
        ProfileRow,
        "dietary_restrictions" | "allergies" | "skill_level"
      > | null;
      return {
        dietaryRestrictions: profile?.dietary_restrictions ?? [],
        allergies: profile?.allergies ?? [],
        skillLevel: profile?.skill_level ?? "beginner",
      };
    },
  }),
};
