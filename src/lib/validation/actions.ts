import { z } from "zod";
import { importedRecipeSchema } from "@/lib/ai/schemas/import";

const cleanList = z.array(z.string().trim().min(1).max(120)).max(50);

export const profileInputSchema = z.object({
  displayName: z.string().trim().max(120),
  dietaryRestrictions: cleanList,
  allergies: cleanList,
  skillLevel: z.enum(["beginner", "intermediate", "advanced"]),
  householdSize: z.number().int().min(1).max(20),
});

export const uuidSchema = z.uuid();

export const createRecipeSchema = importedRecipeSchema.extend({
  source: z.string().trim().min(1).max(120),
  sourceUrl: z.url().optional(),
  parentRecipeId: z.uuid().optional(),
  imageUrl: z.string().max(2048).optional(),
});

export const updateRecipeSchema = importedRecipeSchema
  .pick({
    title: true,
    description: true,
    minutes: true,
    difficulty: true,
    servings: true,
    ingredients: true,
    equipment: true,
    steps: true,
    tags: true,
  })
  .partial()
  .extend({ id: z.uuid(), imageUrl: z.string().max(2048).optional() });

export const feedbackSchema = z.object({
  recipeId: z.uuid(),
  rating: z.number().int().min(1).max(5).optional(),
  substitutionsMade: cleanList.optional(),
  equipmentAdjusted: cleanList.optional(),
  scaledServings: z.number().int().positive().max(100).optional(),
  wouldCookAgain: z.boolean().optional(),
  notes: z.string().trim().max(2000),
});
