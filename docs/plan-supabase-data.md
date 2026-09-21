# Plan — Replace mock data with Supabase

Goal: `/today`, `/kitchen`, `/recipes`, and `/cook/[id]` read real rows from
Supabase instead of `src/lib/mock-data.ts`; kitchen scans save merged items;
users can edit their profile after signup.

## 1. Real data needed

| Data                                                                                 | Table                       | Notes                                                                         |
| ------------------------------------------------------------------------------------ | --------------------------- | ----------------------------------------------------------------------------- |
| Profile (dietary_restrictions, allergies, skill_level, household_size, display_name) | `profiles` (exists)         | Editable via new /settings page                                               |
| Ingredients + equipment                                                              | `kitchen_items` (exists)    | Read on /today panel + /kitchen; written by scan-save + manual add            |
| Recipe catalogue                                                                     | `recipes` (**new**)         | Global read-only seed set; steps stored as jsonb matching `cookingStepSchema` |
| Saved recipes per user                                                               | `saved_recipes` (**new**)   | Join table powering /recipes                                                  |
| In-progress session for "Already cooking" card                                       | `cooking_sessions` (exists) | `status = 'in_progress'`, latest first; `recipe` jsonb holds title + slug     |

## 2. Recipe data source & license

**No scraping.** The seed set is **6 original recipes written for this
project** (StarterChef team) — simple beginner dishes using common pantry
items. Because they are written by us, there is no third-party copyright; we
release them under **CC0 / public domain** and record that in the
`recipes.license` column (`"CC0-1.0"`, `source = "StarterChef original"`).

Seed recipes (in `supabase/seed/recipes.sql`):

1. Tomato egg stir-fry (15 min, easy)
2. Garlic butter mushrooms on toast (12 min, easy)
3. One-pan mushroom noodles (20 min, easy)
4. Fried rice with whatever-you-have (20 min, easy)
5. Creamy pantry pasta (25 min, easy)
6. Sheet-pan sausage & veg (35 min, medium)

Steps use the same shape as `cookingStepSchema` (`index`, `title`,
`instruction`, `durationSeconds?`, `tip?`, plus `ingredients` per-step list
for the "For this step" chips).

## 3. Schema changes

New migration `supabase/migrations/0005_recipes.sql`:

- `public.recipes` — `id uuid pk`, `slug text unique`, `title`,
  `description`, `minutes int`, `difficulty text check
('easy','medium','hard')`, `servings int`, `why_good text`, `icon text`
  (lucide icon name, mapped client-side), `image_tint text` (gradient token
  pair), `ingredients text[]`, `equipment text[]`, `steps jsonb`,
  `tags text[]`, `source text`, `license text`, `created_at`.
- `public.saved_recipes` — `user_id uuid → profiles`, `recipe_id uuid →
recipes`, `created_at`, `primary key (user_id, recipe_id)`.
- **RLS enabled on both.** `recipes`: `for select using
(auth.role() = 'authenticated')` (catalogue is shared, read-only).
  `saved_recipes`: own rows only.
- Unique index `kitchen_items (user_id, kind, lower(name))` so scan-save can
  `upsert` and **merge** rather than duplicate/overwrite.

No changes to existing tables. `cooking_sessions.recipe` jsonb already stores
an arbitrary snapshot — we store `{ slug, title, steps }` there.

## 4. Pages / components that change

- `src/lib/data/` **(new)** — typed query helpers using
  `src/lib/supabase/server.ts`: `getProfile()`, `getKitchenItems()`,
  `getRecipes()`, `getSavedRecipes()`, `getRecipeBySlug()`,
  `getActiveCookingSession()`. Types in `src/lib/types.ts` (new) — DB row
  shapes; `RecipeIdea`-compatible view model kept in
  `src/lib/recipe-view.ts` mapping a row → card props (icon name → Lucide
  component via `src/lib/recipe-icons.ts`).
- `/today` — becomes async server component: fetches recipes (top 2 by
  `minutes`), active `cooking_sessions` row for the "Already cooking" card
  (hidden when none), and kitchen items for `<KitchenPanel>` (now takes
  `ingredients`/`equipment` props).
- `/kitchen` — lists real `kitchen_items` grouped by kind, real profile
  summary, manual add/remove via server action, link to /settings.
- `/recipes` — lists `saved_recipes` joined to `recipes`; "Save" toggle on
  each card via `SaveRecipeButton` (client) → `toggleSavedRecipe` action.
  Empty state links to /today.
- `/cook/[id]` — `[id]` is the recipe **slug**; loads the recipe row (incl.
  `steps` jsonb); `?step=` still works for session resume. 404 when slug
  unknown.
- `src/components/kitchen-panel.tsx` — props-driven, no mock import.
- `src/components/recipe-card.tsx` — accepts the new view model (icon +
  tint resolved by caller) and optional `saved`/`onToggleSave` slot.
- `src/components/scan-kitchen-button.tsx` — after a scan, shows detected
  items with a **"Add to kitchen"** confirm button (suggest-accept) that
  calls the `saveKitchenItems` server action; existing items are kept.
- `src/lib/mock-data.ts` — kept for reference/tests but no page imports it;
  header comment updated to mark it deprecated.
- `src/proxy.ts` — add `/settings` to `protectedPaths`.
- `src/lib/nav.ts` — add Settings link (header nav; bottom nav unchanged to
  keep mobile bar at 3 items — Settings is reachable from /kitchen + header).
- `README.md` — document `supabase/seed/recipes.sql` step.

## 5. Kitchen scan flow (merge, not replace)

1. `ScanKitchenButton` captures a frame → `POST /api/ai/kitchen-scan`
   (unchanged) returns `KitchenScanResult`.
2. UI lists detected ingredients/equipment (with low-confidence items marked
   "uncertain") and an **Add to kitchen** button — nothing is saved until
   the user confirms.
3. `saveKitchenItems(items)` server action (new,
   `src/app/(app)/kitchen/actions.ts`):
   - `upsert` into `kitchen_items` on `(user_id, kind, lower(name))`
   - `source = 'scan'`, `quantity` from `estimatedQuantity`,
     `expires_on = now() + expiresWithinDays` when provided
   - existing rows are **updated**, never deleted — merge semantics.
4. `revalidatePath("/kitchen")` + `revalidatePath("/today")`; client tracks
   `kitchen_items_saved` PostHog event.

## 6. New actions / routes

All mutations are **server actions** (the app has no non-AI API routes;
actions keep forms simple and match App Router conventions):

- `src/app/(app)/kitchen/actions.ts`
  - `saveKitchenItems(items)` — merge-upsert (used by scan confirm + manual
    add)
  - `removeKitchenItem(id)` — delete own row
- `src/app/(app)/recipes/actions.ts`
  - `toggleSavedRecipe(recipeId)` — insert/delete in `saved_recipes`
- `src/app/(app)/settings/actions.ts`
  - `updateProfile(formData)` — update `profiles` row
- `src/app/(app)/cook/[id]/actions.ts`
  - `startCookingSession(recipeSlug)` — creates/returns the in-progress
    `cooking_sessions` row so "Already cooking" has real data; called from a
    client "Let's cook" button (falls back to plain navigation if insert
    fails so the demo never dead-ends).

## 7. New pages

- `src/app/(app)/settings/page.tsx` + `profile-settings-form.tsx` (client) —
  display name, dietary restrictions (pills/checkboxes), allergies,
  skill level (select), household size (number). Saves via `updateProfile`.
  Linked from header nav and the /kitchen profile card ("Edit profile").

## 8. Seed

`supabase/seed/recipes.sql` — idempotent `insert ... on conflict (slug) do
nothing` for the 6 recipes above. README gains a step: run it after
migrations.

## 9. Remaining mock usage (explicit)

- `mockCookingSession` steps → replaced by `recipes.steps`; mock file stays
  only as a reference for the AI-suggestion shape until `suggest-recipes`
  writes real `cooking_sessions`. AI-generated suggestions are still
  ephemeral (not persisted) — flagged as follow-up.
- `FilterPills` remains decorative (no data dependency).

## 10. Risks

- Server Components now require Supabase env vars at runtime; pages already
  sit behind `proxy.ts` auth, and `createClient()` throws a clear error if
  env is missing.
- `recipes` catalogue is global — RLS select policy must not expose it to
  `anon` (intended: authenticated only).
- `lower(name)` unique index needs `upsert ... onConflict` matching
  `(user_id, kind, name)` — we normalize name casing in the action.
