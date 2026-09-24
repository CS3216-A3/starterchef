# StarterChef end-to-end phase execution plan

> Phase 3/4 implementation note (September 2026): migrations `0028` and
> `0029` and the runbook in [phase-3-4-rollout.md](phase-3-4-rollout.md)
> supersede the historical Phase 3/4 policy below. Recipe text/vision uses
> `AI_PROVIDER` with `RECIPE_VERIFICATION_ROUTING=single` by default; public
> HTTP(S) recipe URLs remain permitted with network destination checks. Live
> voice is OpenAI-primary with one pre-connection Gemini fallback. Cross-
> provider recipe verification and strict source allowlisting are deferred.

## Purpose and source of truth

This is the implementation order for the remote baseline at `origin/main`
commit `e864b40`. It supersedes the older migration numbering in
`docs/plan-backend.md`; that document remains the architectural and security
specification. No phase is deployable until its exit gate passes.

The work is implemented as vertical slices: schema and authorization first,
then server contract, then the existing screen's adapter, then automated and
manual verification. The UI is retained where possible; it is not treated as a
trusted source of identity, pantry, recipe, session, verification, or quota
state.

## Fixed decisions

- Current application baseline: `backend/replan-remote`, with remote schema
  migrations through `0017`.
- Existing development Supabase project is non-production. Never reset it if it
  contains records that matter; use a disposable project for destructive reset
  testing.
- Authentication is existing email/password Supabase Auth. Every user request
  resolves identity using the cookie-bound server client and `auth.getUser()`.
- OpenAI and Gemini are both production providers for text, vision, and live
  voice. The existing `google-lite` configuration remains evaluation-only.
- Recipe-source and YouTube approval is an external process. The app enforces a
  versioned server-only allowlist module; it has no admin UI or database table.
- User media is private. The existing public `recipe-images` bucket may contain
  only shared catalogue imagery after the migration audit.
- AI output is suggest-accept. It never writes a pantry item, accepted recipe,
  recipe adaptation, session mutation, or preference without a normal protected
  application action and user confirmation.

## Before Phase 0

1. Work from `backend/replan-remote`; retain `backend/phase01-pre-rebase` only
   as the historical implementation reference.
2. Run `npm.cmd ci` again after the remote dependency changes. Add
   `@playwright/test` as a development dependency and install Chromium before
   writing the security spike.
3. Create an uncommitted `.env.local` for the non-production project. It has
   only app credentials. CI keeps separate `SUPABASE_TEST_URL`,
   `SUPABASE_TEST_PUBLISHABLE_KEY`, and `SUPABASE_TEST_SECRET_KEY` secrets.
4. Confirm email/password sign-in works and configure the Supabase Auth test
   setup so the E2E helper can create confirmed, unique users.
5. Run a read-only pantry preflight for blank names, overlong values,
   equipment with expiry dates, and duplicate `(user_id, kind,
lower(btrim(name)))` keys. If it reports records, stop and manually correct
   those records before applying `0018`.
6. Inspect `supabase_migrations.schema_migrations`. If former local migrations
   `0006` or `0007` were applied, create an additive reconciliation plan from
   their actual effects; do not edit history or reset the development project.

## Shared rules implemented once in Phase 1

All protected Route Handlers use one helper layer. It verifies the user, creates
a request ID, validates input before quota use, requires a matching Origin for
cookie-authenticated mutations, adds `Cache-Control: private, no-store`, and
returns this error shape:

```ts
{
  error: {
    code: string;
    message: string;
    requestId: string;
  }
}
```

User-scoped reads/writes use the cookie-bound Supabase client. The admin client
is server-only and is limited to quota consumption, cleanup, worker leases,
telemetry, and transactional draft promotion. No route accepts `user_id` from
the browser.

The versioned `src/lib/recipe-source-allowlist.ts` contains exact normalized
HTTPS hosts and exact permitted YouTube IDs. Any URL import, redirect, scraper
fetch, or provider video reference is rejected before network access unless it
matches that module. The allowlist change process stays outside the app.

## Phase 0 — required two-user security spike

### Database and Storage

Create `0018_security_and_pantry.sql`:

- Replace broad profile policies with owner `SELECT` and `UPDATE`; profile rows
  are created only by the private signup trigger and cannot be client-deleted.
- Add pantry `updated_at`, stored `normalized_name`, bounded name/quantity
  checks, no-equipment-expiry check, and unique `(user_id, kind,
normalized_name)` constraint.
- Add `merge_kitchen_items(p_items jsonb)` as a `SECURITY INVOKER` RPC. It
  derives `user_id` from `auth.uid()`, validates every item, atomically upserts,
  returns affected rows, and never deletes pantry items.
- Keep `ai_usage_quota.count` as the consumed-credit column; replace the mutable
  policy and old RPC with service-role-only `consume_ai_usage(user_id, units)`.
- Reconcile the remote broad grants/default privileges with explicit least-
  privilege grants. Preserve required current app access but remove client
  mutation access to quota, telemetry, and future draft/worker state.

Create `0019_private_user_media.sql`:

- Create private `kitchen-images`: JPEG, PNG, or WebP; 8 MiB maximum.
- Create private `recipe-inputs`: approved image/video import material; 20 MiB
  maximum.
- Require `<user-id>/<random-uuid>.<derived-extension>` object names. Storage
  policies require both that first path segment and `owner_id` match the JWT
  subject. Permit insert/select/delete only; deny update and use `upsert: false`.
- Add private-path fields needed to replace user `recipes.image_url` and
  `steps[].photoUrl` public URLs. Do not make the existing public bucket private
  until its user objects have been copied and audited in Phase 5.

### Server and UI

- Add `GET /api/pantry-items`, returning only the verified caller's pantry
  rows, even though RLS independently guarantees the same result.
- Add `POST /api/kitchen-images` with `multipart/form-data` field `image`.
  Require same origin, authenticated caller, matching MIME/magic bytes,
  extension, non-zero dimensions, at most 4096 by 4096 pixels, at most 12
  megapixels, and 8 MiB. Generate the private path server-side and return only
  `{ objectPath }`.
- Add a small file-upload component to `/kitchen` that confirms secure upload.
  It stores no detections and does not alter pantry rows. The existing scan UI
  remains until Phase 2 replaces its base64 contract.
- Replace pantry server-action loops with the merge RPC; use a Zod pantry input
  schema and return safe action errors.

### Tests and exit gate

- Unit-test normalization, merge input validation, MIME/magic/dimension checks,
  and common HTTP responses.
- Add Supabase integration tests with users A and B: A creates/reads A pantry;
  B cannot select/update/delete/foreign-insert it; anonymous access fails.
- Add the Playwright spike: A logs in, adds a unique ingredient, calls the
  pantry API, uploads a tiny JPEG; anonymous gets `401`; B sees no A item and
  cannot read/list/upload to A's Storage path. Cleanup deletes only test users
  and exact fixture objects.
- Manual proof: run the app, perform those A/B flows in isolated browser
  profiles, then run `npm.cmd run test:e2e:spike`.

Phase 0 is complete only when the Playwright proof and database-level RLS tests
pass against the non-production project.

## Phase 1 — secure the current data and API surface

### Backend work

- Add the shared route helper described above and convert all protected existing
  routes: kitchen scan, kitchen voice, suggestions, assistant, realtime,
  import, edit, adapt, and step-check.
- Move Zod parsing ahead of every quota call. The existing
  `ai_usage_quota.count` column records consumed weighted AI credits and stays
  read-only to users.
- Add `server-only` to admin, quota, worker, provider, and private-media code.
  Replace raw provider/Storage/database error messages with stable errors and
  request-ID server logs that exclude content, tokens, URLs, keys, and media.
- Change data helpers/actions that silently return empty results after database
  errors to return typed safe failures or throw into a safe application error
  boundary.
- Validate profile actions, recipe saves, feedback, and kitchen deletions at
  the server boundary. RLS remains defense in depth, not input validation.
- Stop all new writes of user media to public `recipe-images`. Existing shared
  catalogue image rendering remains unchanged pending Phase 5 migration.

### Frontend work

- Make every route consumer handle the common error envelope and retryable vs
  non-retryable states without displaying raw provider text.
- Keep existing pages and visual design. Update only their loading, disabled,
  quota, and safe-error states as contracts change.
- Keep the current direct AI flows functional during this phase, but do not add
  any new client payload fields that duplicate server-owned context.

### Tests and exit gate

- Test Origin rejection, request IDs, no-store headers, malformed payloads not
  consuming quota, and weighted quota behavior.
- Test every existing user table's cross-user read/write denial, including
  recipes, feedback, sessions, saved recipes, and session events.
- Test current UI screens with provider calls mocked; no normal CI test calls a
  real provider.

Phase 1 is complete when all existing protected endpoints use the common
contract and no authenticated browser client can mutate its quota, profile
identity, worker state, telemetry, or another user's row.

## Phase 2 — trusted scanning and stored-recipe recommendations

### Migration `0021_kitchen_scans_and_recommendations.sql`

- Create `kitchen_scans` with owned status, private `object_path`, validated
  detections, stable failure code, idempotency key, timestamps, and 24-hour
  expiry. Owners may select; only protected routes/actions write.
- Add indexes for owner recency, idempotency, and expiry cleanup. Do not create
  a separate recommendation persistence table in v1.

### Backend work

- Replace the current base64 kitchen-scan request with multipart upload to the
  private bucket. Persist a scan, call the vision gateway, validate its result,
  and return candidate IDs in `awaiting_confirmation` state.
- Add `applyKitchenScan(scanId, acceptedCandidates)`. It verifies ownership and
  candidate IDs, calls the merge RPC once, and makes the scan terminal. Empty
  selection rejects it.
- Make `POST /api/ai/suggest-recipes` accept only `maxMinutes` and `servings`.
  Load pantry, profile, history, feedback, shared recipes, and accepted owned
  recipes server-side. Apply allergy/diet/equipment/time/difficulty filters
  deterministically before one bounded AI ranking call. Validate returned IDs
  and fall back to deterministic order.
- Move recipe-import photo/video payloads to `recipe-inputs` now; provider calls
  receive a server-loaded private object only after ownership and file checks.

### Frontend work

- Adapt the existing scanner to upload a file/camera frame, show candidate
  items, permit editing/removal, and explicitly apply the selected items.
- Replace current recommendation payload construction with filters only;
  display stored recipe cards and a clear no-match state rather than generating
  a recipe automatically.
- Use private signed media only while a component needs to preview a scan; never
  persist the URL in browser state, recipes, or session events.

### Tests and exit gate

- A scan is visible only to its owner, applies once, and cannot erase pantry.
- Invalid/foreign object paths, duplicate idempotency keys, malformed detections,
  allergen conflicts, and unavailable equipment are denied.
- Spoofed browser inventory/profile/history fields are rejected because they are
  absent from the schema; an AI-ranked response contains only supplied eligible
  recipe IDs.

Phase 2 is complete when the original camera UX works through private Storage
and suggestion-accept pantry updates, with no base64 media or browser-authority
over recommendation context.

## Phase 3 — imports, drafts, source allowlist, and verification

### Migration `0021_recipe_drafts_and_verification.sql`

- Extend the current `recipes` table with `source_type`, `image_path`, schema
  version, verification summary, and accepted timestamp; retain current
  `user_id`, `parent_recipe_id`, `is_personalized`, and `source_url`.
- Create owned `recipe_drafts` as both durable work item and user preview:
  source metadata/path/hash, canonical recipe, verification summary, stable
  failure, idempotency key, fixed quota cost, retry/lease fields, accepted
  recipe link, expiry, and explicit state transitions.
- Add one-active-draft and `(user_id, idempotency_key)` uniqueness constraints.
  Add a service-role worker-claim RPC with a lease and an idempotent owner-only
  draft-acceptance RPC.

### Backend work

- Replace direct `createUserRecipe`, AI edit/adapt save, and personalized-copy
  persistence with draft creation and draft acceptance. Manual owner edits that
  change ingredients, quantities, equipment, time, or steps re-run deterministic
  checks before publication.
- Replace arbitrary URL scraping and YouTube usage with the server-only
  allowlist. Reject redirects, private/reserved network destinations, unapproved
  hosts/IDs, and client-provided HTML fallback before network access.
- Deploy one container worker. It leases drafts, retrieves only owned private
  input, validates media again, extracts/imports, deletes temporary input, and
  performs retryable provider work with bounded retries.
- Imported recipes run canonical-schema and deterministic food-safety checks.
  Generated and materially AI-adapted recipes additionally run the fixed
  cross-provider workflow: OpenAI generator; Gemini researcher and safety
  verifier; OpenAI critic/adjudicator; Gemini final verifier after at most one
  revision. A critical deterministic or verifier block cannot be overridden.

### Frontend work

- Keep the import/edit/customize screens, but replace direct save buttons with
  draft status: uploading, queued, extracting, verifying, blocked with safe
  findings, ready for review, accepted, or rejected.
- The user previews the canonical recipe and verification summary, then presses
  one explicit Accept button. Show source-not-allowed and safety blocks clearly;
  do not expose chain-of-thought, raw prompts, or provider citations beyond the
  approved verification summary.
- Recipe customization sends recipe ID and bounded intent, not an entire
  browser-owned recipe object. Existing "View changes" becomes the draft
  preview before acceptance.

### Tests and exit gate

- Test allowlist parsing, private-address/redirect denial, job transitions,
  leases, retry ceiling, idempotency, owner-only acceptance, and cleanup.
- Test that imports never bypass deterministic checks; generated/adapted drafts
  cannot be accepted without required reports, independent final verification,
  and explicit user acceptance.
- Run real provider smoke tests only with separate low-spend keys and opt-in
  configuration. Record schema pass rate, safety blocks, latency, tokens, and
  cost using the existing evaluation framework.

Phase 3 is complete when every user-visible AI recipe change becomes an owned,
auditable draft and no unallowlisted source or unverified recipe is published.

### Photo recipe correction (migration `0030`)

The current draft implementation uses the single provider selected by
`AI_PROVIDER`; its public HTTP/HTTPS import policy is unchanged. Photo drafts
now classify a recipe card versus a finished dish before generation. The
finished-dish result is an explicitly labeled home-cook approximation, not a
transcription. Both photo modes preserve inferred details for user review;
initial and final verifiers receive the original private image and trusted
dietary constraints. Repairable omissions request the existing single revision,
while irreparable safety or identity problems remain blocks.

`0030_photo_recipe_clarification.sql` adds an owner-only, one-round clarification
on the same active draft and reserves seven quota units for photo classification
plus the existing generation/review ceiling. Apply it before deploying the new
photo workflow. Paused drafts expire before their 24-hour private inputs are
removed; the daily retention job and draft-creation RPC release expired active
slots. The `eval:photo` command accepts a consented local JPEG path and never
commits or persists that image.

## Phase 4 — durable cooking, assistant, and live voice

### Migration `0022_session_integrity_and_retention.sql`

- Extend existing `cooking_sessions` with `version`, `updated_at`, and accepted
  adaptation entries. Preserve current `recipe_id`, snapshot, summary, feedback,
  and event relations.
- Reconcile existing active sessions by keeping each user's newest one and
  abandoning older ones, then add a partial unique active-session index.
- Add bounded `session_events.payload` rules, event retention metadata, owner
  read/append rules, and a single feedback row per owned session where required.

### Backend work

- Update progress, adaptation, and completion actions to require exact owned
  `sessionId` plus `expectedVersion`. Completion affects exactly one session and
  is idempotent.
- Assistant and step-check routes accept `sessionId`; they load owned recipe
  snapshot, current step, profile, pantry, and approved compact history on the
  server. They never trust client recipe/step titles or public image URLs.
- Store checkpoint media privately; session events retain only a bounded private
  path/reference and structured verdict, never a public URL or raw image.
- Replace OpenAI realtime handling with server-created client secrets and
  server-built instructions. Replace browser Gemini key usage with a server-
  minted constrained ephemeral token. Both providers emit one internal event
  union, have a 15-minute limit, and can only propose actions for normal user
  acceptance. Typed/browser speech remains available.

### Frontend work

- Wire existing cook UI to version-conflict reload behavior, exact session
  completion, persisted timers/progress, and private checkpoint preview.
- Make text/voice controls show provider availability, connection expiry, and
  typed fallback. Never include a provider key or server context in client
  props.
- Keep the existing feedback/history screens, but render only owned session
  timelines and safe bounded event content.

### Tests and exit gate

- Test that B cannot read/write A session, event, feedback, checkpoint, or
  realtime credential; completing one session never completes another.
- Test optimistic-lock conflict, private checkpoint access, transcript disposal,
  credential expiry, provider switching, and explicit action acceptance.

Phase 4 is complete when cooking survives refresh, all assistant context is
server-owned, and both live providers operate without browser-visible provider
keys.

## Phase 5 — telemetry, public-media remediation, evidence, and rollout

The current migration order and release commands are in
[`phase-5-release.md`](phase-5-release.md). This section records planning
history; migration names and command examples below are superseded by the
runbook's `0033`/`0034` sequence.

### Migration `0023_ai_telemetry_and_capability_routing.sql`

- Extend `ai_calls` with route, stage, prompt version, user/job/session links,
  provider/model/capability/modality, fallback, latency, token usage, outcome,
  stable error, and live connection metadata. Store no request body, prompt,
  recipe text, media, allergy values, transcript, SDP, or credentials.
- Introduce capability routing for OpenAI and Gemini. Permit at most one fallback
  only for connection/timeout/429/5xx before valid output; never fallback after
  a safety refusal, schema failure, tool side effect, or live output begins.

### Operational work

- Run a server-only migration script to inventory `recipe-images`, copy every
  user-prefixed object to private Storage, persist a private path, verify it,
  delete its public source, and produce a count-only audit. Restrict public
  read to catalogue paths only after the audit is zero.
- Run hourly cleanup for expired scans, failed source media, expired drafts,
  worker leases, and old private checkpoint media according to the retention
  table in the backend specification.
- Generate Supabase database types after each schema migration and replace
  hand-maintained drift. Add dashboards/alerts for provider failures, fallback,
  quota, verification blocks, leases, and cleanup failures.

### Final evidence and release gate

- Run lint, typecheck, unit tests, hosted Supabase integration tests, Playwright
  spike, provider-contract tests, build, and opt-in evaluation suites.
- Manually perform the A/B security proof, source allowlist rejection, scan
  confirmation, draft verification/acceptance, exact-session conflict, and both
  live-provider fallback checks.
- Deploy to a staging environment first. Enable source allowlists, worker,
  OpenAI Live, and Gemini Live separately. Production enablement requires zero
  cross-user test failures, zero hard safety-evaluation violations, and zero
  remaining public user-media objects.

## Verification commands

On Windows, the final pipeline is:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:security:integration
npm.cmd run test:security:e2e
npm.cmd run build
npm.cmd run eval -- suggest-recipes
```

Provider smoke tests and real evaluations are explicit opt-in jobs. Ordinary
unit, integration, and E2E tests use mocks or the isolated non-production
Supabase project and never print passwords, tokens, keys, signed URLs, or media.

## Completion definition

The project is ready only when every phase exit gate has passed, all user media
is private, the database and Storage enforce cross-user denial independently of
the UI, imports and generated/adapted recipes follow the allowlist and draft
workflow, live voice has no browser provider key, and the documented test suite
passes on the deployed migration history.
