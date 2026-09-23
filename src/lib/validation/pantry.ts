import { z } from "zod";

const optionalTrimmed = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .nullish()
  .transform((value) => value ?? null);

export const pantryItemSchema = z
  .object({
    kind: z.enum(["ingredient", "equipment"]),
    name: z.string().trim().min(1).max(120),
    quantity: optionalTrimmed,
    expiresOn: z.iso
      .date()
      .nullish()
      .transform((value) => value ?? null),
    icon: z.string().trim().min(1).max(80).nullish(),
    source: z.enum(["manual", "scan"]).default("manual"),
  })
  .superRefine((item, context) => {
    if (item.kind === "equipment" && item.expiresOn) {
      context.addIssue({
        code: "custom",
        path: ["expiresOn"],
        message: "Equipment cannot have an expiry date",
      });
    }
  });

export const pantryItemsSchema = z.array(pantryItemSchema).min(1).max(100);
export type PantryItemInput = z.input<typeof pantryItemSchema>;
