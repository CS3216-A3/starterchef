# M17 and M18 — implementation and evidence

Prepared initially against `main` at `7b27e04`, then synced with `8d96672` before pushing. PR #2 is now merged upstream; this branch adds scan-review improvements on top and incorporates the pricing files from PR #15 (`134da5d`). The rest of PR #2 is inherited from current `main`.

## M17 — UI decisions for an AI application

### Show uncertainty where the user makes the decision

Kitchen-scan output is a set of candidates, not a definitive inventory. The review screen calls them “possible items” and shows how many need checking. Low-confidence candidates have a warm accent, an alert icon, and the visible label “Check this item · low AI confidence.” The checkbox references that explanation with `aria-describedby`, so colour is not the only signal.

High- and medium-confidence detections are preselected as in PR #2, while low-confidence detections remain unchecked. Nothing is persisted until the user presses “Add to my kitchen.” The save request includes only selected candidate IDs and the user's edited fields. This balances review effort against the risk of accepting an uncertain guess. An alternative would leave every candidate unchecked; that gives stricter confirmation but adds repetitive taps. Preselecting every candidate would reduce taps further but encourage accidental acceptance of doubtful results.

Names, quantities, and expiry dates are editable before confirmation. Touch targets and wrapped input rows keep the review usable on narrow screens. If every candidate is uncertain, saving stays disabled until the user selects something. If nothing was detected, the screen offers clearer-photo guidance and a discard action. Failed saves retain the review, edits, and selection so the cook can retry without rescanning.

Implementation: [`scan-kitchen-button.tsx`](../src/components/scan-kitchen-button.tsx). Evidence: [scan screenshot](product-hunt/screenshots/scan-review.png), [annotated gallery](product-hunt/gallery/02-review-your-scan.png), and the [browser-check report](product-hunt/verification.json). The screenshot is a clearly labelled synthetic example; it does not measure vision accuracy or confidence calibration.

### Keep assistance in the current cooking step

The existing cook screen presents one instruction, progress, a timer, text/voice help, and an optional camera checkpoint together. The user does not have to reconstruct the recipe in a separate chat. For supported AI changes, `CookAssist` shows a proposal, the current instruction, and the proposed replacement with “Confirm change” and “Dismiss.” Suggested edits therefore remain reviewable before application.

Evidence: [`cook-assist.tsx`](../src/components/cook-assist.tsx), [`step-assist.tsx`](../src/components/step-assist.tsx), and [cook screenshot](product-hunt/screenshots/cook-assist.png). These interactions already existed on `main`; this task documents them rather than claiming they were newly built. The example assistant answer is mocked, not a live evaluation result.

## M18 — landing page

The existing hero and feature sections now sit alongside the approved monthly plans and an accessible Free-vs-Plus comparison table:

- Free Starter: 100 credits/month.
- StarterChef Plus: 1,500 credits/month; S$4.90/month or S$39.90/year.
- Top-ups: 500 credits for S$2.90; 1,500 credits for S$7.90.
- Core tools on both plans; limited Free scanning/imports/recommendations/assistance; Plus-only voice, photo checkpoints, personal versions, history/memory, and priority processing.

The comparison has a caption, row and column headings, and readable text alternatives for ticks and dashes. It fits 320px and 390px screens without page overflow. Hero actions are links with a single interactive target. Copy no longer promises an unbuilt skill-unlock system. “Cooks per month” estimates were removed from the landing page because the representative calculation includes features excluded from Free and does not include live voice.

The page has an absolute title to avoid repeating the StarterChef name, a canonical URL, inherited description/Open Graph/Twitter metadata, an existing generated 1200 × 630 Open Graph image, robots rules, and a sitemap. The default public URL now points to the supplied production domain instead of localhost; `NEXT_PUBLIC_SITE_URL` can still override it.

Evidence: [`page.tsx`](<../src/app/(marketing)/page.tsx>), [`credits.ts`](../src/lib/credits.ts), [desktop capture](product-hunt/screenshots/landing-production-desktop.png), [mobile capture](product-hunt/screenshots/landing-production-mobile.png), and [pricing capture](product-hunt/screenshots/pricing.png).

## Scope and verification

The pricing UI is a description of the intended launch plans. This change does not implement payments, monthly grants, a credit ledger, per-feature quotas, or priority processing. The running backend uses daily weighted AI quotas. See [credits.md](credits.md) for outstanding backend work.

The capture script performs browser assertions against the production UI components with synthetic responses. `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` provide repository-level validation. Live Supabase/AI flows need configured test credentials and are distinct from these component checks.

M20 submission copy, maker comment, gallery, thumbnail, and capture sources are in the [Product Hunt launch kit](product-hunt/README.md).

Final checks: production build and typecheck passed; 101 unit tests passed and six integration tests were skipped. ESLint reported no errors and one warning in a generated workflow route. The built-site browser check confirmed the title, canonical URL, description, Open Graph PNG (1200 × 630), Twitter card, robots and sitemap, and 320px/390px layouts. See [site-verification.json](product-hunt/site-verification.json). No live AI or database calls were made.
