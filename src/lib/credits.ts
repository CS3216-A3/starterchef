/**
 * Credit model — the single source of truth for what AI actions cost and what
 * each plan includes. Pricing UI, quota enforcement and the writeup all read
 * from here so they can't drift apart.
 *
 * Costs are derived from measured token profiles per action and the per-model
 * rates in `evals/costs.ts`. See `docs/credits.md` for the full derivation and
 * the assumptions behind each number.
 */

/**
 * USD of model spend that one credit represents, at list prices.
 *
 * Chosen so the cheapest action still costs a whole credit (no fractions to
 * round) while the most expensive stays a legible number rather than tens of
 * thousands.
 */
export const CREDIT_USD = 0.0001;

/** SGD per USD, for reconciling plan prices (quoted in SGD) against costs. */
export const SGD_PER_USD = 1.28;

export type AiAction =
  | "kitchen_scan"
  | "kitchen_voice"
  | "suggest_recipes"
  | "assistant_question"
  | "step_check"
  | "adapt_recipe"
  | "edit_recipe"
  | "session_recap"
  | "import_text"
  | "import_url"
  | "import_photo"
  | "import_video"
  | "live_voice_minute";

/**
 * Credit cost per action, rounded up from measured USD cost.
 *
 * Vision actions carry an image (~1.5k input tokens); `edit_recipe` is
 * multi-turn tool calling, so it bills roughly 2.5x a single pass.
 */
export const CREDIT_COSTS: Record<AiAction, number> = {
  kitchen_voice: 1,
  assistant_question: 3,
  step_check: 5,
  session_recap: 5,
  kitchen_scan: 6,
  suggest_recipes: 7,
  adapt_recipe: 10,
  import_photo: 10,
  import_text: 11,
  import_url: 11,
  edit_recipe: 23,
  // Per 30s of video: Gemini samples video at ~290 tokens/second (1fps frames
  // plus audio), so a flat price would badly under-charge long clips.
  import_video: 44,
  // Native-audio live sessions bill per minute of streamed audio, which is
  // ~100x a text call. Charged per minute, not per session.
  live_voice_minute: 120,
};

/** Video import is billed per 30-second block, rounded up. */
export const VIDEO_BLOCK_SECONDS = 30;

/** Credits for one AI action. Duration-billed actions take their length. */
export function creditCostFor(
  action: AiAction,
  options?: { videoSeconds?: number; voiceSeconds?: number },
): number {
  if (action === "import_video") {
    const seconds = options?.videoSeconds ?? VIDEO_BLOCK_SECONDS;
    const blocks = Math.max(1, Math.ceil(seconds / VIDEO_BLOCK_SECONDS));
    return CREDIT_COSTS.import_video * blocks;
  }
  if (action === "live_voice_minute") {
    const seconds = options?.voiceSeconds ?? 60;
    return (
      CREDIT_COSTS.live_voice_minute * Math.max(1, Math.ceil(seconds / 60))
    );
  }
  return CREDIT_COSTS[action];
}

/** Model spend, in USD, that a credit balance represents at list prices. */
export function creditsToUsd(credits: number): number {
  return credits * CREDIT_USD;
}

export interface Plan {
  id: "free" | "plus";
  name: string;
  priceSgd: number;
  annualPriceSgd?: number;
  /** Free: one-off welcome grant. Plus: refreshed every month. */
  credits: number;
  recurring: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free Starter",
    priceSgd: 0,
    credits: 1000,
    recurring: false,
  },
  {
    id: "plus",
    name: "Plus",
    priceSgd: 4.9,
    annualPriceSgd: 39.9,
    credits: 2500,
    recurring: true,
  },
];

export interface TopUp {
  id: "small" | "large";
  name: string;
  priceSgd: number;
  credits: number;
}

export const TOP_UPS: TopUp[] = [
  { id: "small", name: "Small", priceSgd: 2.9, credits: 1000 },
  { id: "large", name: "Large", priceSgd: 7.9, credits: 3000 },
];

/**
 * A representative cook: suggestions, a few questions, one camera checkpoint
 * and the post-cook recap. Used to express a balance in cooks rather than
 * credits, which means nothing to a user on its own.
 */
export const CREDITS_PER_TYPICAL_COOK =
  CREDIT_COSTS.suggest_recipes +
  CREDIT_COSTS.assistant_question * 4 +
  CREDIT_COSTS.step_check +
  CREDIT_COSTS.session_recap;

/** Whole cooks a balance covers, for "about N cooks a month" style copy. */
export function approxCooks(credits: number): number {
  return Math.floor(credits / CREDITS_PER_TYPICAL_COOK);
}
