# Credit model

How much each AI action costs us, what we charge for it, and why the plan
allocations are what they are. The numbers here are implemented in
`src/lib/credits.ts` and asserted in `tests/credits.test.ts`, so pricing UI and
this document can't quietly drift apart.

## Why this exists

The app used to treat every AI call as equivalent: `src/lib/rate-limit.ts`
increments one counter per request against a flat daily cap
(`AI_DAILY_LIMIT`, default 50), and the settings page told users each feature
"uses one credit."

That is wrong by roughly two orders of magnitude at the extremes. Parsing a
dictated pantry item costs about $0.0001; a minute of native-audio live voice
costs about $0.012. Charging both "one credit" means either the cheap actions
are priced absurdly high or the expensive ones run at a loss — and since the
expensive ones are the differentiated features (video import, live voice), the
loss lands exactly where usage is most enthusiastic.

## Deriving the costs

**Model rates** come from `evals/costs.ts`. The default text/vision model,
`gemini-5.8-flash`, is $0.15 per 1M input tokens and $0.60 per 1M output.

**Token profiles** are estimated per action from the prompt sizes in
`prompts/*.md`, the output schemas in `src/lib/ai/schemas/`, and the input each
route actually attaches:

| Action                  | Input tokens         | Output tokens | USD      | Credits |
| ----------------------- | -------------------- | ------------- | -------- | ------- |
| Kitchen voice parse     | ~330                 | ~100          | $0.00011 | 1       |
| Assistant question      | ~1,250               | ~150          | $0.00028 | 3       |
| Step photo check        | ~2,000 (incl. image) | ~200          | $0.00042 | 5       |
| Session recap           | ~1,800               | ~300          | $0.00045 | 5       |
| Kitchen scan            | ~1,800 (incl. image) | ~400          | $0.00051 | 6       |
| Suggest recipes         | ~950                 | ~800          | $0.00062 | 7       |
| Adapt recipe            | ~1,300               | ~1,200        | $0.00092 | 10      |
| Import (photo)          | ~1,900 (incl. image) | ~1,200        | $0.00100 | 10      |
| Import (text / URL)     | ~2,400               | ~1,200        | $0.00108 | 11      |
| Edit recipe (tools)     | ~1,300 × ~2.5 turns  | ~1,200        | $0.00230 | 23      |
| Import (video), per 30s | ~8,700               | ~1,200        | $0.00440 | 44      |
| Live voice, per minute  | ~8,000 audio         | ~1,600 audio  | $0.01200 | 120     |

Notes on the two outliers, which drive the whole model:

- **Video.** Gemini samples video at roughly 290 tokens per second (1fps frames
  plus audio). A 3-minute clip is ~52,000 input tokens on its own. Charging a
  flat price per import would under-charge long videos badly, so video is billed
  per 30-second block (`VIDEO_BLOCK_SECONDS`), rounded up.
- **Live voice.** Native-audio sessions (`/api/ai/realtime/session`) bill per
  minute of streamed audio, not per request. One minute costs about what 120
  pantry-item parses cost. It is billed per minute, rounded up.

**One credit = $0.0001 of model spend at list prices** (`CREDIT_USD`). That
denomination is chosen so the cheapest action still rounds to a whole credit,
and the dearest stays a legible two- or three-digit number. All costs round up,
so we never under-charge.

## Plan economics

At S$1.28 per USD:

| Plan             | Price      | Credits   | Our cost | Revenue  | Gross margin    |
| ---------------- | ---------- | --------- | -------- | -------- | --------------- |
| Free Starter     | Free       | 100/mo    | $0.01/mo | —        | — (acquisition) |
| StarterChef Plus | S$4.90/mo  | 1,500/mo  | $0.15    | US$3.83  | 96.1%           |
| Plus annual      | S$39.90/yr | 18,000/yr | $1.80    | US$31.17 | 94.2%           |
| Top-up Small     | S$2.90     | 500       | $0.05    | US$2.27  | 97.8%           |
| Top-up Large     | S$7.90     | 1,500     | $0.15    | US$6.17  | 97.6%           |

The ladder is sound: a Plus credit (S$0.00327, or S$0.00222 annual) is cheaper
than a Large top-up credit (S$0.00527), which is cheaper than a Small one
(S$0.00580). Subscribing is always the best value, and the annual plan is a 32%
discount on twelve monthly payments. Every paid tier is asserted to hold
positive margin in `tests/credits.test.ts`.

## What the allocations actually buy

A representative cook — one suggestion run, four assistant questions, one camera
checkpoint, one recap — is **29 credits** (`CREDITS_PER_TYPICAL_COOK`).

- 100 free credits ≈ 3 AI-assisted cooks per month.
- 1,500 Plus credits ≈ 51 cooks per month.

## Open questions for the team

Three things this model surfaces that are product calls, not frontend ones:

1. **The free tier now binds quickly, which is the point.** At ~3 AI-assisted
   cooks a month, Free Starter is a genuine taste of the AI rather than an
   indefinite allowance — the upgrade pressure comes from the features that
   are Plus-only (voice, photo checkpoints, personalised versions, cooking
   history) as much as from the credit cap. Worth watching in launch metrics
   whether 100/mo converts or just frustrates.

2. **Live voice is the real constraint, and it conflicts with the pitch.** At
   120 credits/minute, a Plus user gets about 12 minutes of native-audio voice a
   month — less than one cooking session — while "cook hands-free" is a headline
   feature. The fix already exists in the codebase: the `web-speech` voice
   provider does browser STT → `/api/ai/assistant` → browser TTS, so it only
   costs the 3-credit assistant call. **Recommendation:** make `web-speech` the
   default voice path and treat native live audio (Gemini Live / OpenAI
   Realtime) as a Plus-only premium mode billed per minute. This is both the
   cheaper and the more honest option, and it needs no new code.

3. **Expiry and rollover are undefined.** The usual shape — subscription credits
   expire at the end of each month, purchased top-up credits never expire —
   needs an explicit decision before the ledger is built, because it changes the
   schema.

## Not built yet

This module is the pricing model, not the enforcement. Still outstanding, and
owned by backend rather than frontend:

- A credit ledger (balance per user, debits per action, grants on renewal).
  Today `src/lib/rate-limit.ts` still enforces a flat daily request cap, and
  that is what the settings page reports.
- Payment integration. There is no Stripe or checkout code in the repo; no tier
  is actually purchasable.
- Wiring `creditCostFor()` into each `api/ai/*` route in place of the current
  one-request-one-unit increment.

Until that lands, the landing page describes the intended model and the settings
page honestly reports the daily request allowance that is actually enforced.
