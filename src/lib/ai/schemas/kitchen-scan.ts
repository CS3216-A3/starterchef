import { z } from "zod";
import { KITCHEN_ICON_KEYS } from "@/lib/item-icon-keys";

const iconKey = z
  .enum(KITCHEN_ICON_KEYS)
  .describe("Best-fitting icon for this item");

/**
 * Result of scanning a photo of the user's kitchen (fridge, pantry, counter).
 * `uncertainItems` are surfaced to the user for confirmation — we never save
 * low-confidence guesses silently.
 */
export const kitchenScanSchema = z.object({
  ingredients: z
    .array(
      z.object({
        name: z.string(),
        confidence: z.enum(["high", "medium", "low"]),
        // OpenAI strict JSON Schema requires every property to be required.
        // Use null when the photo does not establish a value.
        estimatedQuantity: z.string().nullable(),
        expiresWithinDays: z.number().int().positive().nullable(),
        icon: iconKey,
      }),
    )
    .max(24),
  equipment: z
    .array(
      z.object({
        name: z.string(),
        confidence: z.enum(["high", "medium", "low"]),
        icon: iconKey,
      }),
    )
    .max(16),
  uncertainItems: z
    .array(z.string())
    .max(20)
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
