import { z } from "zod";
import { KITCHEN_ICON_KEYS } from "@/lib/item-icon-keys";

export const scanCandidateSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["ingredient", "equipment"]),
  name: z.string().trim().min(1).max(120),
  quantity: z.string().trim().min(1).max(120).nullable(),
  expiresOn: z.iso.date().nullable(),
  icon: z.enum(KITCHEN_ICON_KEYS),
  confidence: z.enum(["high", "medium", "low"]),
});

export const scanCandidatesSchema = z
  .array(scanCandidateSchema)
  .max(40)
  .superRefine((candidates, ctx) => {
    const seen = new Set<string>();
    candidates.forEach((candidate, index) => {
      if (seen.has(candidate.id)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "id"],
          message: "Candidate IDs must be unique",
        });
      }
      seen.add(candidate.id);
    });
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
  .max(40)
  .superRefine((items, ctx) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item.id)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "id"],
          message: "Candidates can only be accepted once",
        });
      }
      seen.add(item.id);
    });
  });
