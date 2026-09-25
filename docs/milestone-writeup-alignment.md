# Milestone write-up alignment

Paste these corrections into the shared milestone document so that it matches
the current implementation and evidence.

## M6 — pricing and credit model

Replace the sentence that says the backend applies costs of approximately one
to six credits with:

> Credits represent product usage rather than raw model tokens. The proposed
> monthly pricing model assigns different costs to different AI actions, from
> 1 credit for a lightweight pantry-voice parse and 3 credits for an assistant
> question to 44 credits per 30-second video block and 120 credits per minute
> of native live voice. This monthly credit model is not yet enforced; the
> deployed backend currently uses a separate daily weighted quota, generally
> charging 1–7 units depending on the operation.

The launch prices remain:

- Free Starter: S$0 with 100 credits per month.
- StarterChef Plus: S$4.90 per month or S$39.90 per year, with 1,500 credits
  per month.
- Small top-up: S$2.90 for 500 credits.
- Large top-up: S$7.90 for 1,500 credits.

## M18 — landing page

### Hero and features

The landing page introduces StarterChef as a cooking companion for beginners
with the headline “Your start to great cooking.” Its main call to action,
“Scan my kitchen,” leads into the core product flow. Five interactive sections
then demonstrate kitchen scanning, personalised recipe matching, recipe
import, step-by-step cooking assistance, and post-cook history. These demos
mirror the production interactions while using illustrative sample data.

### Pricing

The pricing section presents the intended Free Starter and StarterChef Plus
plans using the shared constants in `src/lib/credits.ts`. Free Starter provides
100 monthly credits. Plus provides 1,500 monthly credits for S$4.90 per month
or S$39.90 per year. Optional top-ups provide 500 credits for S$2.90 or 1,500
credits for S$7.90. The page clearly states that top-ups add credits without
unlocking Plus-only features. Payments, monthly credit grants, and plan
enforcement are proposed launch functionality and are not yet implemented.

### Responsive design and accessibility

The page was verified at 320px and 390px widths without horizontal overflow.
The pricing comparison uses a semantic table caption, column headings, and row
headings. Included and unavailable features have screen-reader text as well as
visual icons. Hero actions are direct links without nested interactive
controls, and each interactive demo uses labelled controls and visible focus
states.

### Search engine optimisation and social previews

The page provides a single descriptive H1, the title “StarterChef · Your start
to great cooking,” a description, canonical production URL, robots rules, and
a sitemap. Open Graph and Twitter metadata use a generated 1200 × 630 image
and the `summary_large_image` card. Automated production checks confirmed HTTP
200 responses, the production canonical URL, mobile layouts, and no browser
runtime errors.

Use the refreshed evidence in `docs/product-hunt/screenshots/`, especially
`landing-production-desktop.png`, `landing-production-mobile.png`,
`pricing.png`, and `opengraph.png`.

## M19 — event properties

Replace the old property paragraph with:

> Examples include `household_size`, `skill_level`, `restriction_count`, and
> `allergy_count` for onboarding; `item_count` and `source` for kitchen
> updates; `result_count`, `max_minutes`, and `servings` for recommendations;
> `recipe_id` and `source` for recipe selection; `recipe_id` for
> cooking-session starts; and `session_id` plus `rating` for feedback and
> completion.

The seven-event funnel order remains:

1. `onboarding_completed`
2. `kitchen_items_saved`
3. `recommendations_generated`
4. `recipe_selected`
5. `cooking_session_started`
6. `feedback_submitted`
7. `cooking_session_completed`

## M20 — Product Hunt materials

Add the prepared maker comment and gallery captions from
`docs/product-hunt/README.md`. State that the materials represent a draft or
simulated Product Hunt launch and that no Product Hunt post has been created.
The current kit contains a 240 × 240 thumbnail and four 1270 × 760 gallery
images. The launch copy also discloses that payment integration and monthly
plan enforcement are still being implemented.
