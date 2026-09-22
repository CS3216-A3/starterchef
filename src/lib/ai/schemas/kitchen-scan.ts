import { z } from "zod";
import { KITCHEN_ICON_KEYS } from "@/lib/item-icons";

const iconKey = z
  .enum(KITCHEN_ICON_KEYS)
  .describe("Best-fitting icon for this item");

/**
 * Result of scanning a photo of the user's kitchen (fridge, pantry, counter).
 * `uncertainItems` are surfaced to the user for confirmation — we never save
 * low-confidence guesses silently.
 */
export const kitchenScanSchema = z.object({
  ingredients: z.array(
    z.object({
      name: z.string(),
      confidence: z.enum(["high", "medium", "low"]),
      estimatedQuantity: z.string().optional(),
      expiresWithinDays: z.number().int().positive().optional(),
      icon: iconKey,
    }),
  ),
  equipment: z.array(
    z.object({
      name: z.string(),
      confidence: z.enum(["high", "medium", "low"]),
      icon: iconKey,
    }),
  ),
  uncertainItems: z
    .array(z.string())
    .describe("Items the model could not identify confidently"),
});

export type KitchenScanResult = z.infer<typeof kitchenScanSchema>;

/**
 * Items parsed from a spoken list ("two tomatoes, an onion and a frying
 * pan"). The model sorts each into ingredient vs equipment.
 */
export const kitchenVoiceSchema = z.object({
  items: z.array(
    z.object({
      kind: z.enum(["ingredient", "equipment"]),
      name: z.string().describe("Singular, clean name, e.g. 'tomato'"),
      quantity: z
        .string()
        .optional()
        .describe("Amount if spoken, e.g. '2', '500g', 'a bunch'"),
      icon: iconKey,
    }),
  ),
});

export type KitchenVoiceResult = z.infer<typeof kitchenVoiceSchema>;
