import { z } from "zod";

export const verificationFindingSchema = z.object({
  severity: z.enum(["info", "warning", "critical"]),
  category: z.enum([
    "safety",
    "allergen",
    "diet",
    "time",
    "equipment",
    "plausibility",
    "instruction",
  ]),
  message: z.string().trim().min(1).max(500),
});

export const independentVerificationSchema = z.object({
  verdict: z.enum(["pass", "revise", "block"]),
  findings: z.array(verificationFindingSchema).max(20),
  summary: z.string().trim().min(1).max(1000),
});

export const adjudicationSchema = independentVerificationSchema.extend({
  revisedRecipe: z.unknown().nullable(),
});
