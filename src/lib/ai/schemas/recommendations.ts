import { z } from "zod";

export const recommendationRankingSchema = z.object({
  rankings: z
    .array(z.object({ id: z.uuid(), reason: z.string().max(240) }))
    .max(50),
});
