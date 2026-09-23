import { z } from "zod";
import { KITCHEN_ICON_KEYS } from "@/lib/item-icons";

export const scanCandidateSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["ingredient", "equipment"]),
  name: z.string().trim().min(1).max(120),
  quantity: z.string().trim().min(1).max(120).nullable(),
  expiresOn: z.iso.date().nullable(),
  icon: z.enum(KITCHEN_ICON_KEYS),
  confidence: z.enum(["high", "medium", "low"]),
});

export const scanAcceptanceSchema = z
  .array(
    z.object({
      id: z.uuid(),
      name: z.string().trim().min(1).max(120).optional(),
      quantity: z.string().trim().min(1).max(120).nullable().optional(),
      expiresOn: z.iso.date().nullable().optional(),
    }),
  )
  .min(1)
  .max(100);
