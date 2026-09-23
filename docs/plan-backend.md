# StarterChef Backend Implementation Specification

## 1. Document status

This document is the decision-complete implementation plan for StarterChef's
assignment-ready backend. It is intentionally scoped to the smallest backend
that supports every stated product flow without introducing enterprise
infrastructure.

The implementation must preserve these locked decisions:

- Next.js 16 App Router on Vercel remains the web/API runtime.
- Supabase remains the authentication, Postgres, and object-storage platform.
- Authentication supports email and password only in v1.
- Row-level security (RLS), not UI filtering, is the final authorization
  boundary for user-owned database rows and stored objects.
- Recommendations rank stored recipes first. A complete recipe is generated
  only after the user explicitly asks for one.
- AI-generated recipes must pass the multi-agent verification workflow in this
  document before they can be shown for acceptance or saved.
- All AI suggestions remain suggest-accept. No scan result, recipe draft,
  substitution, adaptation, or learned preference is silently applied.
- OpenAI and Gemini are both first-class AI providers for text/vision and
  live/realtime voice. Provider credentials are issued or used only by the
  server; raw audio and full voice transcripts are not stored.
- Kitchen and recipe-source media is private and short-lived.
- YouTube processing is limited to exact video IDs in a server-only allowlist.
  Approval logistics and evidence are managed outside StarterChef.
- A small container worker is permitted for allowlisted-video processing and
  multi-agent recipe jobs. Redis and a second queueing product are not used.
- The required backend spike is delivered and demonstrated before the rest of
  the backend.

### 1.1 Remote rebaseline — 2026-09-23

This plan is now based on `origin/main` at `e864b40`, not the pre-import
baseline on which the first Phase 0/1 implementation was written. This
subsection takes precedence over any conflicting statement below.

The remote already supplies migrations `0001` through `0017`, user-owned and
personalised recipes, recipe import/edit/adaptation routes, a public
`recipe-images` bucket, `session_events`, profile onboarding, kitchen icons,
model-comparison evaluation code, and an AI-credit display. These are existing
application behaviour to harden and migrate; they must not be reimplemented in
parallel.

| Existing remote capability                                                                            | Rebaselined backend decision                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recipes.user_id`, `parent_recipe_id`, `is_personalized`, `source_url`, and `image_url`               | Treat the current recipe table as the canonical base. Shared recipes remain readable by signed-in users; a private recipe remains readable and mutable only by its owner. Future draft/verification state extends this table and its owner workflow.                                                                                                                |
| Direct import, edit, adaptation, and personalised-copy saves                                          | Replace direct publication with an owned draft state. Imported recipes receive deterministic validation; generated or materially AI-adapted recipes also complete multi-agent verification. Only the user can accept a passing draft into their recipe library.                                                                                                     |
| `recipe-images` is public and stores user-owned recipe/step media                                     | Public Storage may contain only deliberately public catalogue imagery. New kitchen, recipe-input, cooking-checkpoint, and user-uploaded media use private buckets. Before public access is removed, an explicit server-side migration job must copy existing user-prefixed objects, replace persisted public URLs with private paths, and delete the public copies. |
| `session_events`, feedback, and AI recap                                                              | Retain the timeline, but add exact-session ownership, optimistic versioning, payload limits, retention, and a completion action that affects one session only. Event payloads are not a bypass around private media or prompt-data limits.                                                                                                                          |
| `AI_PROVIDER=google                                                                                   | openai                                                                                                                                                                                                                                                                                                                                                              | google-lite` and evaluation reports | Preserve the evaluation harness. The application gateway is revised to canonical `openai` and `gemini` capability routing; `google-lite` remains an evaluation alias, not a production security or fallback policy. |
| Existing kitchen scan, assistant, realtime, import, edit, adapt, step-check, and kitchen-voice routes | Do not blanket-disable routes the current UI uses. Move each route to the common authenticated-handler contract, validate before quota use, derive owned context server-side, and return safe no-store responses.                                                                                                                                                   |

The server-side recipe-source allowlist is a versioned code module, not an
admin screen or database workflow. It contains exact approved HTTPS hosts and
YouTube video IDs. Approval evidence and changes to that list are handled
outside the app. URL fetching, scraper invocation, and provider video access
must reject every source that is not on the list before any network request.

Migration history is immutable. The next new migrations are exactly:

1. `0018_security_and_pantry.sql`
2. `0019_private_user_media.sql`
3. `0021_kitchen_scans_and_recommendations.sql`
4. `0022_recipe_drafts_and_verification.sql`
5. `0023_session_integrity_and_retention.sql`
6. `0024_ai_telemetry_and_capability_routing.sql`

If either former local migration named `0006` or `0007` has already been
applied to a development project, do not rename, delete, replay, or reset it.
First inspect that project's migration history and data. Reconcile it with
additive migrations after `0017`; reset only a disposable test project.

## 2. Current repository baseline

The repository already contains useful backend foundations. These are extended,
not replaced:

- Supabase SSR browser/server/admin clients.
- Email/password sign-up and sign-in, auth callback, session-refreshing proxy,
  and profile creation trigger.
- Migrations `0001`–`0017`, including `recipes` with user-owned/imported and
  personalised variants, recipe source/image fields, `session_events`, profile
  onboarding, and kitchen-item icons.
- `profiles`, `kitchen_items`, `cooking_sessions`, `recipe_feedback`,
  `ai_calls`, `ai_usage_quota`, `recipes`, `saved_recipes`, and
  `session_events` tables.
- Owner-based RLS on the existing user tables.
- Server actions for pantry, profile, saved recipe, user recipe, feedback, and
  cooking-session writes.
- Protected AI routes, structured Zod outputs, versioned prompts, rate limiting,
  friendly provider errors, model comparison, and provider abstraction.
- Recipe import from text, URL, photo, and video; AI edit/adapt; camera
  step-checks; session recap and cooking-memory behaviour.

The following gaps must be fixed rather than worked around:

1. `recipe-images` is public although it stores user-owned recipe and cooking
   media; there is no private kitchen-media policy or migration path for those
   objects.
2. RLS exists but is not proven with a real two-user integration test.
3. Existing broad policies and default grants need explicit least-privilege
   reconciliation; quota must be read-only to users after its `count` to
   `units` migration.
4. The broad profile policy permits direct profile deletion, which cascades
   through user data.
5. Pantry bulk saving uses a non-atomic read-then-write loop.
6. Data helpers frequently discard database errors and return empty data.
7. Import, URL scraping, uploaded video, edit, adaptation, and recipe-save
   flows bypass the source allowlist, authoritative server context, and draft
   verification workflow.
8. Existing AI routes charge quota before validation and do not consistently
   apply origin checks, request IDs, no-store headers, or stable error shapes.
9. Cooking progress and completion are not exact-session operations; completion
   can affect every active session.
10. Session event payloads can hold raw Q&A and public URLs without explicit
    size, retention, or private-media controls.
11. `ai_calls` is not written by `measuredGenerate` and lacks user/job context.
12. Gemini Live still relies on a browser-visible provider key; realtime and
    assistant routes can trust browser-supplied recipe/step context.
13. The domain step type uses `ingredients`, while one AI schema uses
    `ingredientsUsed`.

## 3. Target architecture

```text
Browser
  |-- Supabase Auth cookies
  |-- Server Components / Server Actions
  |-- Protected Next.js Route Handlers
  |     |-- cookie-bound Supabase client (normal user data)
  |     |-- src/lib/ai capability router (OpenAI + Gemini)
  |     |-- short-lived OpenAI/Gemini live-session credentials
  |     `-- narrowly scoped admin client (quota/job/telemetry only)
  |-- OpenAI Realtime over WebRTC, after server session authorization
  |-- Gemini Live over WebSocket, using a server-minted ephemeral token
  |-- browser speech fallback
  |
  `-- private Supabase Storage uploads

Supabase
  |-- Auth
  |-- Postgres + RLS
  |-- private kitchen-images bucket
  `-- private recipe-inputs bucket

Container worker
  |-- claims recipe_drafts rows through a leased Postgres RPC
  |-- allowlisted YouTube download/transcription
  |-- photo/video extraction
  |-- multi-agent generation and verification
  `-- stale media/job cleanup
```

Rules for choosing an interface:

- Use Server Components for authenticated reads used to render pages.
- Use Server Actions for same-application form and button mutations.
- Use Route Handlers for multipart uploads, AI calls, asynchronous job creation,
  job polling, and the required protected API demonstration.
- Never accept `user_id` from a browser. Derive it from a freshly verified
  Supabase identity for every request and action.
- Use the cookie-bound client for ordinary user reads/writes so RLS applies.
- Use the admin client only in a module marked `server-only`, and only for
  quota consumption, telemetry insertion, worker state transitions, cleanup,
  and transactionally promoting verified drafts.

## 4. Delivery sequence

Implementation must be delivered in this order. A phase is complete only when
its listed tests pass.

### Phase 0: required spike

Deliver exactly these capabilities first:

1. Authenticate user A with the existing email/password flow.
2. Create one `kitchen_items` ingredient through the existing kitchen UI/action.
3. Call protected `GET /api/pantry-items` and observe only A's rows.
4. Upload one fixture JPEG to the private `kitchen-images` bucket.
5. Sign in as user B and prove B cannot select, update, or delete A's item and
   cannot read or list A's image.
6. Call the protected route anonymously and receive `401`.

Phase 0 includes `0018`, the private `kitchen-images` policies from `0019`,
the protected pantry route, a file-input upload fallback, and the Playwright
test specified in section 15. It does not modify the existing import, cook, or
recipe-image UI beyond preventing new user media from entering public Storage.

### Phase 1: secure data foundation

- Harden all existing policies and grants.
- Make pantry merges atomic.
- Generate Supabase database types.
- Stop swallowing database errors.
- Standardize auth, error, request-ID, no-store, and origin checks.
- Make weighted quota consumption tamper-proof.
- Reconcile remote `0015` broad grants and default privileges with explicit
  grants; preserve the grants needed by current routes while removing user
  mutation of profiles beyond update, quota, drafts, telemetry, and worker
  state.
- Retrofit the existing AI routes rather than feature-gating them. Validate
  their inputs before quota use and move trusted user/session/recipe context to
  the server where that context already exists.

### Phase 2: scans and stored-recipe recommendations

- Add the kitchen scan lifecycle and short-lived media processing to the
  existing camera scan route.
- Make recommendations load trusted context on the server.
- Filter unsafe/ineligible recipes deterministically before AI ranking.
- Feed completion history and feedback into ranking.
- Move import photo/video payloads out of JSON/base64 and into owned private
  objects before they reach a model.

### Phase 3: recipe imports and verified generation

- Add the combined durable recipe-draft/job model around the existing direct
  import, edit, adaptation, and personalised-copy save flows.
- Deploy the container worker.
- Implement photo extraction and exact-allowlisted YouTube transcription.
- Implement multi-agent generation, research, critique, safety checking, and
  adjudication.
- Permit saving only after verification and explicit user acceptance.

### Phase 4: persistent cooking and voice

- Repair the existing session-event, recap, feedback, and checkpoint flows with
  exact-session progress and accepted adaptations.
- Ground assistant requests from the owned session on the server.
- Add OpenAI Realtime and Gemini Live behind one provider-neutral client
  interface, plus browser speech and typed fallbacks.
- Save feedback and use it in subsequent recommendations.

### Phase 5: hardening and evidence

- Complete integration, E2E, provider-contract, and evaluation suites.
- Verify cleanup, quotas, failure handling, telemetry redaction, and deployment
  runbooks.

## 5. Database migrations

Create additive, ordered migrations after remote migration `0017`. Never
renumber, edit, or replay any already-applied migration.
Every migration must be applied to the isolated test project before production.

### 5.1 `0018_security_and_pantry.sql`

#### `profiles`

- Drop the existing `FOR ALL` policy.
- Grant authenticated users `SELECT` and `UPDATE`, but not direct `INSERT` or
  `DELETE`.
- Add owner-only policies:
  - `SELECT USING (auth.uid() = id)`.
  - `UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id)`.
- Profile creation remains exclusively in the private auth trigger.
- Keep `taste_preferences jsonb`, but require application data to use this exact
  versioned shape:

```ts
type TastePreferencesV1 = {
  schemaVersion: 1;
  likedCuisines: string[];
  flavourTags: string[];
  dislikedIngredients: string[];
};
```

- Add `default_prep_minutes int null check (default_prep_minutes between 5 and 480)`.

#### `kitchen_items`

- Add `updated_at timestamptz not null default now()`.
- Add generated column:
  `normalized_name text generated always as (lower(btrim(name))) stored`.
- Add database checks:
  - `char_length(btrim(name)) between 1 and 120`.
  - `quantity is null or char_length(quantity) <= 120`.
  - Equipment must have `expires_on is null`.
- Drop `kitchen_items_user_kind_name_idx`.
- Add a unique constraint on `(user_id, kind, normalized_name)`.
- Recreate owner CRUD policies explicitly `TO authenticated`.
- Replace the per-row save loop with an RPC named
  `merge_kitchen_items(p_items jsonb)`:
  - `SECURITY INVOKER` so RLS remains active.
  - Set `user_id` from `auth.uid()` inside SQL.
  - Validate kind, names, lengths, and dates.
  - Perform one `INSERT ... ON CONFLICT ... DO UPDATE` transaction.
  - Return the affected rows.
  - Never delete pantry rows as part of a scan merge.

#### `ai_usage_quota`

- Keep `count` as the existing consumed-credit column; document its weighted
  credit meaning at the API boundary.
- Drop the authenticated `FOR ALL` policy.
- Optionally permit owner `SELECT`; grant no authenticated mutation privilege.
- Replace `increment_ai_usage(uuid)` with
  `consume_ai_usage(p_user_id uuid, p_units int)`:
  - Executable only by `service_role`.
  - Require `p_units between 1 and 10`.
  - Atomically reset at UTC date change and increment by `p_units`.
  - Return the resulting number of units.

#### Policy cleanup

- Recreate every existing owner policy with `TO authenticated`.
- Preserve the remote recipe policy: signed-in users read shared rows
  (`user_id is null`) plus only their own rows; private rows never become
  shared through client input.
- Revoke the broad authenticated default privileges added by remote `0015`.
  Grant each existing table only the verbs its RLS policies and current server
  actions need. `ai_usage_quota` is `SELECT` only for authenticated users;
  `recipe_drafts` and `ai_calls` have no authenticated mutation grant.
- Do not rely on future default privileges. Every later migration grants only
  its required access explicitly.

Before applying this migration, run preflight queries for blank/oversized
pantry rows and multiple conflicting normalized names. The migration must stop
and report them; it must not silently discard user data.

### 5.2 `0019_private_user_media.sql`

Create private buckets through idempotent inserts into `storage.buckets`:

| Bucket           |  Limit | Allowed MIME types                                            | Purpose                                  |
| ---------------- | -----: | ------------------------------------------------------------- | ---------------------------------------- |
| `kitchen-images` |  8 MiB | `image/jpeg`, `image/png`, `image/webp`                       | Kitchen uploads and cooking checkpoints. |
| `recipe-inputs`  | 20 MiB | `image/jpeg`, `image/png`, `image/webp`, approved video types | User-owned import source material.       |

Both buckets have `public = false`. `recipe-images` remains temporarily public
only for shared catalogue assets. No new user media may be written to it.

Storage object names must be
`<auth-user-id>/<random-uuid>.<validated-extension>`. Original filenames are
never retained. Policies on `storage.objects` must be bucket-specific:

- `INSERT TO authenticated WITH CHECK` that the first path segment equals the
  caller's JWT subject.
- `SELECT TO authenticated USING` both the same first path segment and
  `owner_id = auth.uid()::text`.
- `DELETE` uses the same ownership condition.
- Do not create `UPDATE` permission; all uploads use `upsert: false`.

The migration does not create `kitchen_scans`; the scan lifecycle belongs to
Phase 2. It does add the media-path columns required to replace public
user-owned `recipes.image_url` and `steps[].photoUrl` values with private
object paths. A deployment-only server script must copy every existing object
under a user UUID prefix from `recipe-images` to the correct private bucket,
update its database path, and delete the public original. Only after the audit
reports zero user-prefixed public objects may the public-read policy be limited
to catalogue paths.

### 5.3 `0021_kitchen_scans_and_recommendations.sql`

Create owned `kitchen_scans` for the private-media flow in section 7.3. It has
an owner, idempotency key, `processing`/`awaiting_confirmation`/terminal status,
private object path, validated detections, stable failure code, timestamps, and
24-hour expiry. Owners may select; protected scan route and confirmation action
perform every mutation. Index owner recency, `(user_id, idempotency_key)`, and
expiry. Recommendations remain computed from server-owned stored data; they do
not need a persistence table in v1.

### 5.4 `0022_recipe_drafts_and_verification.sql`

Extend `recipes`:

| Column             | Definition/default                                           |
| ------------------ | ------------------------------------------------------------ |
| `user_id`          | Existing nullable owner FK; null for shared recipes          |
| `parent_recipe_id` | Existing self-reference for personalised versions            |
| `is_personalized`  | Existing Boolean; set only by accepted workflow              |
| `source_type`      | `catalogue`, `imported`, `adapted`, `generated`, or `manual` |
| `source_url`       | Existing nullable text; only a validated allowlisted URL     |
| `image_path`       | Nullable private Storage path; replaces user `image_url`     |
| `schema_version`   | Integer not null default 2                                   |
| `verification`     | JSONB not null default `{}`                                  |
| `accepted_at`      | Timestamptz nullable                                         |

Replace the current select policy with:

```sql
user_id is null or user_id = auth.uid()
```

Shared recipes are maintained by migrations/seeds. Client-visible recipe
creation, AI adaptation, and personalised copies are routed through the owned
draft-acceptance RPC; manual editing remains possible only for an owned,
accepted recipe and must return it to deterministic validation when a
safety-relevant field changes.

Create `public.recipe_drafts`, which is both the durable job and the draft:

| Column                      | Definition                                       |
| --------------------------- | ------------------------------------------------ |
| `id`                        | UUID primary key                                 |
| `user_id`                   | Owner FK, cascade delete                         |
| `kind`                      | `generated`, `photo`, or `youtube`               |
| `status`                    | State enum represented by a checked text column  |
| `request`                   | Validated user request JSONB                     |
| `recipe`                    | Canonical recipe JSONB, default `{}`             |
| `verification`              | Structured reports/citations JSONB, default `{}` |
| `source_url`                | Canonical YouTube URL or null                    |
| `source_object_path`        | Private photo path or null                       |
| `source_content_hash`       | SHA-256 or null                                  |
| `failure_code`              | Stable machine-readable code or null             |
| `failure_message`           | Safe user-facing message or null                 |
| `idempotency_key`           | Client-generated UUID                            |
| `quota_units`               | Integer fixed when job is created                |
| `retry_count`               | Integer not null default 0                       |
| `lease_owner`               | Worker identifier or null                        |
| `lease_until`               | Timestamptz or null                              |
| `accepted_recipe_id`        | Nullable FK to recipes                           |
| `created_at` / `updated_at` | Timestamptz                                      |
| `expires_at`                | Timestamptz nullable                             |

Allowed statuses and transitions are fixed:

```text
queued
  -> acquiring_source
  -> extracting_or_generating
  -> verifying
  -> adjudicating
  -> awaiting_user_acceptance
  -> accepted | rejected

Any active state -> failed_retryable -> queued  (maximum two retries)
Any active state -> blocked | failed_permanent | cancelled
```

No other transition is valid. Add:

- Unique `(user_id, idempotency_key)`.
- Partial unique index allowing only one active draft per user. Active means any
  state from `queued` through `awaiting_user_acceptance`.
- Indexes on `(status, lease_until, created_at)` and `(user_id, created_at desc)`.
- Owner-only `SELECT` policy. Authenticated users receive no direct mutation
  grant; protected routes and the worker own state changes.

Add `claim_recipe_draft(p_worker_id text)` as a service-role-only RPC using
`FOR UPDATE SKIP LOCKED`. It claims the oldest eligible job, sets a 15-minute
lease, and returns the row. The worker renews the lease every minute.

Add `accept_recipe_draft(p_draft_id uuid)` as a `SECURITY DEFINER` RPC with a
fixed search path. It must, in one transaction:

1. Resolve the caller with `auth.uid()`.
2. Lock the owned draft.
3. Require `status = 'awaiting_user_acceptance'` and a passing verification.
4. Return the existing recipe when already accepted, making retries idempotent.
5. Insert one private immutable recipe from the validated canonical draft.
6. Set the draft to `accepted` and link `accepted_recipe_id`.
7. Return the recipe ID.

### 5.5 `0022_session_integrity_and_retention.sql`

Extend `cooking_sessions`:

- `recipe_id uuid null references recipes(id) on delete set null` already
  exists; preserve and backfill it when the owned snapshot identifies a recipe.
- `version int not null default 1 check (version > 0)`.
- `updated_at timestamptz not null default now()`.
- `adjustments jsonb not null default '[]'`.

Before adding the unique index, deterministically keep each user's newest
`in_progress` session and mark older ones `abandoned`. Then add a partial unique
index allowing one `in_progress` session per user.

The session `recipe` JSONB remains the immutable-at-start working snapshot.
Accepted cooking-time adaptations update only this snapshot, append a structured
entry to `adjustments`, and increment `version`; they do not overwrite the
catalogue recipe.

Extend `recipe_feedback`:

- `would_make_again boolean null`.
- `perceived_difficulty text null` checked to `easy`, `about_right`, or `hard`.
- Unique `(user_id, session_id)` when `session_id` is not null.

Feedback remains owner-readable/writable, but server input schemas bound rating,
notes, and arrays. The client cannot supply the `learned` field. The server
derives structured learning tags after explicit feedback and uses them only as
recommendation signals; it does not mutate the explicit profile.

### 5.6 `0023_ai_telemetry_and_capability_routing.sql`

Extend `ai_calls` with nullable `job_id`, `session_id`, `route`, `stage`,
`prompt_version`, `provider`, `model`, `capability`, `modality`,
`fallback_from`, `connection_latency_ms`, `live_duration_ms`, `close_reason`,
`status`, and `error_code`. Constrain provider to `openai` or `gemini`, modality
to `text`, `vision`, or `live`, and status to `success` or `failed`. The service
role inserts telemetry; users may select only their own rows.

Do not store request bodies, prompts, model output, images, allergy lists, audio,
or transcripts in `ai_calls`.

## 6. Canonical recipe schema v2

Use one Zod schema for seeded, imported, generated, accepted, and session-snapshot
recipes. Migrate seed data and remove the `ingredients`/`ingredientsUsed`
mismatch. The exact domain shape is:

```ts
type CanonicalRecipeV2 = {
  schemaVersion: 2;
  title: string; // 1..120 characters
  description: string; // 1..500 characters
  servings: number; // integer 1..20
  prepMinutes: number; // integer 0..240
  cookMinutes: number; // integer 0..480
  difficulty: "easy" | "medium" | "hard";
  ingredients: Array<{
    id: string; // unique kebab-case identifier within the recipe
    name: string; // 1..120 characters
    normalizedName: string; // lowercase canonical name
    quantityText: string; // 1..80 characters; never inferred when unknown
    allergens: AllergenCode[];
  }>;
  equipment: string[]; // unique normalized values, maximum 20
  steps: Array<{
    index: number; // contiguous, starting at 1
    title: string; // 1..120 characters
    instruction: string; // 1..600 characters
    ingredientIds: string[]; // every ID must exist above
    durationSeconds?: number; // integer 1..28,800
    safetyChecks: Array<{
      kind: "temperature" | "cross_contact" | "storage" | "visual";
      instruction: string;
      targetCelsius?: number;
      holdSeconds?: number;
    }>;
    tip?: string; // maximum 240 characters
  }>;
  dietaryTags: string[];
  storageAdvice?: string; // maximum 500 characters
  reheatingAdvice?: string; // maximum 500 characters
};
```

Initial `AllergenCode` values are `peanut`, `tree_nut`, `milk`, `egg`, `fish`,
`shellfish`, `soy`, `wheat`, `sesame`, and `unknown_compound`. Maintain a
versioned alias/compound mapping in code. Recompute allergens from ingredient
names; never trust model-produced allergen tags alone.

## 7. API and Server Action contracts

### 7.1 Common behavior

Every protected Route Handler must:

1. Resolve a verified user using the server Supabase client.
2. Return `401` when unauthenticated.
3. For cookie-authenticated mutations, require `Origin` to match
   `NEXT_PUBLIC_SITE_URL`.
4. Parse with Zod and return `400` for invalid input before charging quota.
5. Never accept or trust a browser-supplied user ID.
6. Return `404` when an owned resource is missing or belongs to another user.
7. Set `Cache-Control: private, no-store` on user-specific responses.
8. Return errors in this shape:

```json
{
  "error": {
    "code": "stable_machine_code",
    "message": "Safe user-facing message",
    "requestId": "uuid"
  }
}
```

Unhandled errors are logged with the request ID and returned as generic `500`.
Provider errors return `502`; temporary service unavailability returns `503`;
quota exhaustion returns `429` with `Retry-After`.

### 7.2 `GET /api/pantry-items`

No request parameters.

Success response:

```ts
{
  items: Array<{
    id: string;
    kind: "ingredient" | "equipment";
    name: string;
    quantity: string | null;
    expiresOn: string | null;
    source: "manual" | "scan";
    createdAt: string;
    updatedAt: string;
  }>;
}
```

The query uses the cookie-bound client and explicitly filters `user_id` to the
verified caller as defense in depth. This is the protected server API used by
the required spike.

### 7.3 `POST /api/ai/kitchen-scan`

- Content type: `multipart/form-data`.
- Field `image`: required file, maximum 8 MiB.
- Field `idempotencyKey`: required UUID.
- Permit JPEG, PNG, and WebP only after both MIME and magic-byte validation.
- Decode enough image metadata to reject zero-sized images and dimensions above
  4096 by 4096.

Processing:

1. Authenticate and validate without consuming quota.
2. Return the existing scan for the same user/idempotency key if present.
3. Consume one quota unit.
4. Upload to `kitchen-images/<user>/<uuid>.<ext>` with the user's client.
5. Create a `processing` scan row.
6. Call `measuredGenerate` using the kitchen scan prompt/schema.
7. Assign a UUID `candidateId` to every detection and store the validated result.
8. Set `awaiting_confirmation` and delete the raw image.
9. On failure, set a stable failure code and leave the image only for cleanup.

Success is `200` with `{ scanId, ingredients, equipment, uncertainItems }`.

`applyKitchenScan(scanId, acceptedCandidates)` is a Server Action. Each accepted
candidate contains its `candidateId` plus optional user-edited name/quantity/date.
The action locks the owned pending scan, verifies candidate IDs, calls the atomic
pantry merge RPC, changes the scan to `applied`, and revalidates kitchen/today.
An empty accepted set marks the scan `rejected`. A scan can be applied once.

### 7.4 `POST /api/ai/suggest-recipes`

Request:

```ts
{
  maxMinutes?: number; // integer 5..480
  servings?: number; // integer 1..20
}
```

The route loads profile, pantry/equipment, expiring items, completed sessions,
feedback, shared recipes, and the caller's accepted private recipes. It must not
accept inventory, allergy, skill, preference, or history fields from the client.

Pipeline:

1. Hard-exclude allergen/diet conflicts.
2. Hard-exclude recipes needing unavailable equipment.
3. Hard-exclude time and beginner/difficulty conflicts.
4. Score candidates: pantry coverage 45%, expiring-item use 15%, explicit
   preference and feedback fit 15%, time fit 10%, skill fit 10%, and fewer
   missing ingredients 5%.
5. Send at most ten eligible candidate IDs and compact metadata to one AI call.
6. Require the model to return only supplied IDs plus a short reason.
7. Validate IDs and fall back to deterministic score order if AI fails.

Response contains two to four existing recipe IDs. If none qualify, return an
empty list with `canGenerate: true`; do not generate automatically.

### 7.5 Recipe drafts

`POST /api/recipe-drafts` accepts exactly one discriminated request:

```ts
type CreateRecipeDraftRequest =
  | {
      kind: "generated";
      idempotencyKey: string;
      request: string; // 1..1000 characters
      maxMinutes?: number; // 5..480
      servings?: number; // 1..20
    }
  | {
      kind: "photo";
      idempotencyKey: string;
      objectPath: string;
    }
  | {
      kind: "youtube";
      idempotencyKey: string;
      url: string;
    };
```

The photo object must be in `recipe-inputs/<caller>/`. The YouTube URL is parsed
to a video ID; arbitrary redirects and URLs are never fetched. The normalized
host and exact ID must be an exact member of the server-side source allowlist.

Quota cost is fixed at creation: generated 6, photo 2, YouTube 3. Job creation
atomically consumes the units, enforces one active draft per user, inserts
`queued`, and returns `202 { draftId, status }`. Repeating an idempotency key
returns the original draft without consuming quota again.

`GET /api/recipe-drafts/:id` returns:

```ts
{
  id: string;
  kind: "generated" | "photo" | "youtube";
  status: RecipeDraftStatus;
  recipe?: CanonicalRecipeV2;
  verification?: VerificationSummary;
  failure?: { code: string; message: string };
  acceptedRecipeId?: string;
}
```

`POST /api/recipe-drafts/:id/accept` invokes the acceptance RPC. It accepts only
`awaiting_user_acceptance`; blocked/unverified jobs can never be promoted.

`POST /api/recipe-drafts/:id/reject` changes only an owned
`awaiting_user_acceptance` draft to `rejected` and sets expiry to seven days.

### 7.6 Cooking actions

`startCookingSession(recipeId)`:

- Verify the recipe is shared or owned by the caller.
- Return an existing active session for the same recipe.
- Mark an active session for a different recipe `abandoned`.
- Insert one session using a canonical recipe snapshot and return its ID.

`updateCookingProgress(sessionId, currentStep, expectedVersion)`:

- Verify ownership.
- Require the step to exist in the snapshot.
- Update only when `version = expectedVersion` and status is `in_progress`.
- Increment version and update timestamp.
- Return `conflict` when the version changed so the client reloads the session.

`acceptRecipeAdjustment(sessionId, proposal, expectedVersion)` validates the
proposed canonical snapshot, preserves hard dietary constraints, appends a
structured adjustment summary, and updates with the same optimistic lock.

`completeCookingSession(sessionId, expectedVersion)` updates exactly that owned
session, sets completion time, and is idempotent when already completed.

`saveRecipeFeedback(sessionId, input)` validates rating 1..5, notes up to 1000
characters, optional `wouldMakeAgain`, and perceived difficulty. It upserts the
single owner feedback row. Server-derived learning tags are not client input.

### 7.7 `POST /api/ai/assistant`

Request:

```ts
{
  sessionId: string;
  question: string; // 1..1000 characters
}
```

The server loads the owned in-progress session, current step, pantry, and
dietary profile. Client-supplied recipe titles or step context are forbidden.
The response remains the validated `assistantReplySchema`. Suggested actions
are displayed for confirmation and never mutate state inside this route.

This route is the typed and browser-speech path. The browser may use speech
recognition to create `question`, displays the text answer, and may use
`speechSynthesis` to speak it. It is also the required fallback when neither
native live provider is available.

### 7.8 `POST /api/ai/realtime/session`

Request:

```ts
{
  provider: "openai" | "gemini";
  sessionId: string;
}
```

The route must authenticate the caller, enforce same-origin/CSRF protection,
load the owned in-progress cooking session, consume two quota units, and build
the provider instructions from the server-owned recipe snapshot, current step,
dietary profile, and pantry. The browser cannot send instructions or recipe
context. The response is `Cache-Control: no-store` and is exactly one branch of
this discriminated union:

```ts
type LiveCredential =
  | {
      provider: "openai";
      model: string;
      clientSecret: string;
      expiresAt: string;
    }
  | {
      provider: "gemini";
      model: string;
      ephemeralToken: string;
      expiresAt: string;
      websocketVersion: "v1beta";
    };
```

Provider behavior is exact:

- `openai`: the server creates an ephemeral client secret with the current
  `POST https://api.openai.com/v1/realtime/client_secrets` endpoint,
  constraining the configured model, voice, instructions, and tools. It
  supplies a privacy-preserving hash of the internal user ID as
  `OpenAI-Safety-Identifier`. The browser uses the returned secret to send its
  WebRTC offer to `POST https://api.openai.com/v1/realtime/calls` and never
  receives `OPENAI_API_KEY`.
- `gemini`: the server creates a single-use Gemini Live ephemeral token,
  using the Google GenAI SDK's server-side `authTokens.create()` method and
  constraining it to the configured Live model and server-built session
  configuration. The token permits new sessions for at most 60 seconds and the
  live session for at most 15 minutes. The browser uses it only with the
  documented constrained `v1beta` Live WebSocket service and never receives
  `GOOGLE_GENERATIVE_AI_API_KEY`.

Gemini ephemeral tokens are currently a Preview capability. Therefore
`AI_GEMINI_LIVE_ENABLED=false` must make the API return
`provider_temporarily_disabled` and the UI must immediately offer OpenAI Live
and typed/browser speech. It must not fall back silently after audio has begun.

Both clients adapt provider events into this internal union:

```ts
type LiveEvent =
  | { type: "connected" }
  | { type: "listening" }
  | { type: "speaking" }
  | { type: "transcript_delta"; text: string }
  | { type: "action_proposal"; proposal: AssistantActionProposal }
  | { type: "error"; code: string; retryable: boolean }
  | { type: "closed"; reason: string };
```

Transcript deltas are memory-only UI state and are erased when the connection
closes. Provider tools may only propose a structured action. The browser must
send that proposal to the existing protected acceptance action before any
database mutation. Close the provider connection when the user stops it, the
cooking session completes, authentication expires, or the 15-minute app limit
is reached. Never log credentials, SDP, audio, transcript text, or provider
event payloads.

### 7.9 Existing import, edit, adaptation, step-check, and voice routes

The remote routes remain product entry points, but their current direct-save and
browser-context contracts are temporary. Apply the following replacement rules:

- `POST /api/ai/import-recipe` accepts text or a reference to an owned private
  upload. A URL or YouTube input is accepted only when its normalized HTTPS host
  and exact video ID are in the versioned allowlist. Remove client-supplied HTML
  as an alternate fetch path. The route validates before charging quota and
  returns an owned draft ID, not a recipe that a client can persist directly.
- `POST /api/ai/edit-recipe` and `POST /api/ai/adapt-recipe` accept an owned
  recipe ID plus bounded edit intent. They load the source recipe, profile, and
  pantry on the server; their output is a proposal/draft. A materially changed
  recipe cannot bypass deterministic validation or required verification.
- `POST /api/ai/step-check` accepts an owned active `sessionId`, optional
  question, and a private image path created by the upload route. It loads the
  step and recipe snapshot server-side, stores no public URL, and records only
  a bounded structured event after successful validation.
- `POST /api/ai/kitchen-voice` may return a validated suggestion list only. It
  cannot write pantry rows; the existing confirmed pantry action remains the
  sole mutation path.
- All five routes use section 7.1's error envelope, same-origin check,
  request-ID logging, `Cache-Control: private, no-store`, and weighted quota
  semantics. Friendly provider messages remain a UI presentation layer, not a
  substitute for stable machine error codes.

## 8. Multi-agent recipe verification

The multi-agent workflow applies to generated recipes and materially AI-adapted
recipes. Imported recipes use the same deterministic validators and source
allowlist but do not need all generative-agent roles. Existing direct
`createUserRecipe`, `updateUserRecipe`, and personalised-copy paths must create
or update an owned draft first; none may write an unverified AI result directly
to an accepted recipe row.

### 8.1 Agent stages

All calls go through `src/lib/ai/`, use prompts in `prompts/*.md`, use Zod
structured output, and record stage telemetry.

The default assignments deliberately cross provider boundaries so that recipe
approval is not based on one provider judging itself:

| Stage                         | Default provider | Required capability                    |
| ----------------------------- | ---------------- | -------------------------------------- |
| Generator                     | OpenAI           | Structured text generation             |
| Researcher                    | Gemini           | Grounded search plus structured output |
| Culinary critic               | OpenAI           | Structured text analysis               |
| Safety verifier               | Gemini           | Structured text analysis               |
| Adjudicator                   | OpenAI           | Structured decision                    |
| Final verifier after revision | Gemini           | Independent structured verification    |

These role assignments are configuration, but a production configuration must
use both providers and the final verifier must differ from the generator.
Changing an assignment requires the provider-contract tests and safety evals to
pass before deployment.

1. **Generator**
   - Receives server-loaded profile, pantry/equipment, time, servings, and the
     explicit user request.
   - Produces `CanonicalRecipeV2` without seeing verifier prompts.
2. Run these three independent calls in parallel:
   - **Researcher** verifies technique/timing/safety claims and returns claim,
     verdict, citation URL, publisher, retrieval time, and a short paraphrased
     evidence note.
   - **Culinary critic** checks quantities, missing ingredients, ordering,
     timers, equipment, internal consistency, and beginner clarity.
   - **Safety verifier** checks the authenticated restrictions/allergies,
     allergen aliases, cross-contact, high-risk ingredients, temperature,
     cooling, storage, and reheating.
3. Run deterministic validation in parallel with the verifiers.
4. **Adjudicator** receives the draft and structured reports, never hidden
   chain-of-thought. It returns one of `approve`, `revise_once`, or `block`.
5. If revised, run deterministic validation plus one **final verifier** call.
   There is no second revision cycle.
6. Only a passing result becomes `awaiting_user_acceptance`.

### 8.2 Verification schema

```ts
type VerificationSummary = {
  schemaVersion: 1;
  overall: "pass" | "block";
  deterministicRulesetVersion: string;
  reports: Array<{
    role: "researcher" | "critic" | "safety" | "adjudicator" | "final";
    verdict: "pass" | "warn" | "block";
    findings: Array<{
      code: string;
      severity: "info" | "warning" | "critical";
      message: string;
      stepIndex?: number;
    }>;
  }>;
  citations: Array<{
    claim: string;
    url: string;
    publisher: string;
    retrievedAt: string;
    evidenceNote: string; // paraphrase, maximum 240 characters
  }>;
};
```

Do not store model reasoning or chain-of-thought.

### 8.3 Trusted research sources

Keep a versioned server-side domain allowlist, not a database/admin workflow:

- Safety: `sfa.gov.sg`, `foodsafety.gov`, `fsis.usda.gov`, `fda.gov`, `nhs.uk`.
- Technique: `seriouseats.com`, `kingarthurbaking.com`, `bbcgoodfood.com`.

The research adapter may use the configured provider's supported web-search or
grounding capability only inside `src/lib/ai`. Validate every returned citation
against the allowlist. If the provider cannot supply admissible evidence for a
safety-critical claim, block with `insufficient_trusted_evidence`; do not fall
back to untrusted websites.

### 8.4 Deterministic blockers

The following always block acceptance and cannot be downgraded by an LLM:

- Any normalized ingredient/allergen intersection with the user's allergies.
- `unknown_compound` for an allergic user until the user clarifies it.
- Dietary restriction conflicts.
- Ingredient IDs referenced by steps but absent from the ingredient list.
- Non-contiguous or empty steps.
- Missing required equipment with no validated adaptation.
- Raw poultry, minced/rolled meat, seafood, egg dishes, reheated rice, or
  leftovers without the relevant versioned safety checkpoint.
- A safety-critical factual claim without an admissible citation.
- Invalid quantities/times or total time exceeding the user's hard limit.

Use a versioned Singapore-focused safety ruleset based on SFA guidance,
including the 75 degrees Celsius for two minutes checkpoint where applicable
and allergen/cross-contact guidance. Store the ruleset version on every accepted
generated recipe so recipes can be re-evaluated after a ruleset update.

## 9. Worker behavior

The worker is a single Dockerized Node process. It polls every 10 seconds and
claims one job at a time per worker instance. Horizontal scaling is safe because
claims use `SKIP LOCKED` and leases.

For all jobs:

- Heartbeat every minute and extend the lease to 15 minutes ahead.
- Retry only network/provider/timeouts, at 30 seconds and then 2 minutes.
- Maximum two retries; schema, safety, allowlist, file, and policy failures are
  permanent.
- Check status before every state transition so cancelled jobs stop.
- Write only validated structured output.
- Delete temporary files in `finally`.

Photo flow:

1. Authenticated route has already verified object ownership.
2. Worker downloads through the admin Storage API after checking the stored
   user/path relationship.
3. Validate magic bytes/dimensions again.
4. Extract `CanonicalRecipeV2` with the multimodal model.
5. Run deterministic validation.
6. Delete the source object immediately after extraction; stale cleanup is the
   fallback.
7. Move to `awaiting_user_acceptance` or a blocked/failed state.

YouTube flow:

1. Re-parse the canonical video ID and re-check the server-side source allowlist.
2. Reject live, unavailable, private, region-blocked, or longer-than-15-minute
   videos.
3. Use `yt-dlp` and `ffmpeg` only inside the worker container.
4. Download audio into an isolated temporary directory, transcribe with
   timestamps, and extract a newly worded canonical recipe.
5. Treat transcript text as untrusted content; it cannot select tools, URLs,
   prompts, or output destinations.
6. Save the video ID/URL, SHA-256, structured recipe, and relevant timestamp
   ranges. Do not save narration or the full transcript.
7. Delete audio and transcript buffers immediately in `finally`.

Generated flow uses the agent stages in section 8.

## 10. AI architecture, routing, quotas, and telemetry

### 10.1 Provider-neutral gateway

OpenAI and Gemini are mandatory first-class providers. Use the canonical
application identifier `"gemini"`; only the adapter module may translate that
to the Google SDK's naming. Extend `src/lib/ai/` with provider-neutral helpers
for structured text/vision generation, tool-assisted research, transcription,
and live-session creation. Provider SDKs remain confined to that directory;
routes, components, and worker orchestration call only the gateway.

The gateway exposes these operations:

```ts
type AiProvider = "openai" | "gemini";
type AiCapability =
  | "kitchen_scan"
  | "recipe_ranking"
  | "recipe_extraction"
  | "recipe_generation"
  | "recipe_research"
  | "recipe_critique"
  | "recipe_safety"
  | "recipe_adjudication"
  | "cooking_assistant"
  | "transcription";

generateStructured<T>(capability, schema, input, context): Promise<T>;
researchStructured<T>(schema, input, context): Promise<T>;
transcribe(input, context): Promise<ValidatedTranscript>;
createLiveSession(provider, ownedSession, context): Promise<LiveCredential>;
```

Every OpenAI text call uses the Responses API with `store: false`. Every text
or vision response from either provider must pass the same capability-specific
Zod schema; provider-native structured output does not replace application
validation. Model IDs are required environment configuration and are never
hardcoded to aliases such as `latest`.

Default capability routing is:

| Capability                                  | Primary                | Fallback                                     |
| ------------------------------------------- | ---------------------- | -------------------------------------------- |
| Kitchen scan and recipe-photo extraction    | Gemini                 | OpenAI                                       |
| Stored-recipe ranking and cooking assistant | OpenAI                 | Gemini                                       |
| Generated-recipe agent stages               | Section 8.1 assignment | Opposite provider, subject to the rule below |

A fallback is allowed only for connection failure, timeout, `429`, or provider
`5xx` before valid output or a tool side effect has been accepted. Do not
fallback on a safety refusal, schema-invalid output, deterministic validation
failure, or after streaming/live output starts. A generation-stage fallback
must preserve the cross-provider invariant: the final verifier cannot use the
same provider that produced the effective draft. Interactive requests make at
most one fallback attempt. Worker retry limits in section 9 still apply.

### 10.2 Live/realtime architecture

Both OpenAI Realtime and Gemini Live are supported. The cook UI presents
`OpenAI Live` and `Gemini Live`, with `AI_LIVE_DEFAULT_PROVIDER` preselected;
it also always presents `Typed / browser speech`. Provider availability comes
from the non-secret `NEXT_PUBLIC_AI_LIVE_PROVIDERS` build-time allowlist; the
session route independently enforces the server-side enable flag.

Live sessions use the endpoint and constraints in section 7.8. OpenAI connects
over WebRTC with a server-created ephemeral client secret. Gemini connects over
WebSocket with a server-created single-use ephemeral token. Standard provider
keys remain server-only. The same server-built cooking context, action proposal
schema, 15-minute app limit, quota charge, no-persistence rule, and redaction
policy apply to both providers.

Native live providers may handle speech-to-speech interaction, but neither may
write application data. If a live answer proposes a recipe adjustment, timer,
step change, or completion, the user must confirm it through the normal
protected application action. Provider switching requires closing the old
connection and creating a new credential; context is reloaded from the server,
not copied from a transcript.

### 10.3 Measurement and quotas

Every call receives:

```ts
{
  userId: string;
  route: string;
  stage: string;
  promptVersion: string;
  jobId?: string;
  sessionId?: string;
}
```

The helper records provider, model, capability, modality (`text`, `vision`, or
`live`), latency, token usage where available, success/failure, stable error
code, and `fallbackFrom` when applicable. Live telemetry additionally records
connection latency, duration, and close reason. It never records raw
input/output, audio, transcript text, ephemeral credentials, or SDP.

Quota units:

| Operation                      | Units |
| ------------------------------ | ----: |
| Kitchen scan                   |     1 |
| Stored-recipe ranking          |     1 |
| Cooking assistant question     |     1 |
| Live/realtime session creation |     2 |
| Photo recipe extraction        |     2 |
| Allowlisted YouTube import     |     3 |
| Verified generated recipe      |     6 |

Default allowance is 50 units per user per UTC day. Validate before consuming.
Job creation consumes its full fixed cost once; retries and idempotent repeats
do not consume more units. Do not implement refunds in v1.

## 11. Security requirements

- Add `import "server-only"` to admin, worker, and server provider modules.
- Never log passwords, access/refresh tokens, service keys, signed URLs, images,
  transcripts, allergy values, or full prompts/model output.
- Never use the admin client for ordinary user-scoped reads when the RLS client
  can perform the operation.
- Treat the existing public `recipe-images` bucket as catalogue-only until its
  user-prefixed contents are migrated. It is never an allowed destination for
  a kitchen image, checkpoint, user upload, import source, or user recipe
  cover image after `0019` is deployed.
- Validate file MIME, magic bytes, size, dimensions, and extension.
- Normalize user text, cap every string/array, and reject unknown fields.
- Do not fetch arbitrary recipe URLs. YouTube input is parsed locally to an ID;
  research URLs originate from provider search and must pass HTTPS host
  allowlisting before retrieval.
- Reject private, loopback, link-local, and reserved IP destinations after DNS
  resolution; validate every redirect or disable redirects.
- Use private buckets and authenticated download/signed URLs of at most five
  minutes. Never generate public URLs for user media.
- Authenticated pages and user APIs are dynamic/no-store. Do not cache responses
  that contain session refresh cookies or user data.
- Keep prompts and source transcripts as untrusted text. They cannot redefine
  tools, policies, destinations, or accepted schemas.
- Model output never bypasses Zod, deterministic validation, RLS, or explicit
  user confirmation.

## 12. Retention and cleanup

The worker performs cleanup hourly:

| Data                                         | Retention                                          |
| -------------------------------------------- | -------------------------------------------------- |
| Successfully processed kitchen image         | Delete immediately                                 |
| Failed/abandoned kitchen image               | Delete within 24 hours                             |
| Successfully extracted recipe photo          | Delete immediately                                 |
| Failed/abandoned recipe photo                | Delete within 24 hours                             |
| YouTube audio/full transcript                | In-memory/temp only; delete immediately            |
| Rejected/failed/cancelled recipe draft       | Delete after 7 days                                |
| Accepted draft verification                  | Copy to recipe; draft may remain as audit metadata |
| Voice audio/transcript                       | Never stored                                       |
| Pantry, accepted recipes, sessions, feedback | Retain until controlled account deletion           |
| Session event payload                        | Retain structured bounded fields only; delete raw  |
| user media by the private-media policy above |

Cleanup lists only known private buckets, validates every target path, deletes
through the Storage API, nulls purged object paths, and records counts and
failures without logging signed URLs or content. A separate one-time migration
audit reports every remaining user-prefixed object in public `recipe-images`;
the release is blocked until it reports zero.

## 13. Failure behavior

Use stable codes. At minimum implement:

- `unauthorized`
- `forbidden_origin`
- `invalid_request`
- `not_found`
- `quota_exceeded`
- `image_too_large`
- `unsupported_image`
- `scan_failed`
- `draft_already_active`
- `source_not_owned`
- `youtube_not_allowlisted`
- `youtube_unavailable`
- `youtube_too_long`
- `source_download_failed`
- `transcription_failed`
- `low_extraction_confidence`
- `allergen_conflict`
- `unsafe_recipe`
- `insufficient_trusted_evidence`
- `verification_disagreement`
- `provider_unavailable`
- `provider_temporarily_disabled`
- `live_credential_expired`
- `version_conflict`

Low-confidence extraction or missing quantities becomes a blocked draft that the
user may edit and resubmit for validation; it is never silently guessed.
Provider outages retry only in the worker. Interactive AI routes return a clear
retryable error and never apply partial state.

## 14. Configuration

Add these variables to `.env.example`. Every value is server-only except the
explicit non-secret `NEXT_PUBLIC_AI_LIVE_PROVIDERS` allowlist:

```text
# Provider keys and capability-specific model IDs. All are required in
# production. Values are deployment decisions, not source-code defaults.
OPENAI_API_KEY=
OPENAI_TEXT_MODEL=
OPENAI_VISION_MODEL=
OPENAI_REALTIME_MODEL=
OPENAI_REALTIME_VOICE=
GOOGLE_GENERATIVE_AI_API_KEY=
GEMINI_TEXT_MODEL=
GEMINI_VISION_MODEL=
GEMINI_LIVE_MODEL=

# Text/vision capability routing.
AI_TEXT_PRIMARY_PROVIDER=openai
AI_TEXT_FALLBACK_PROVIDER=gemini
AI_VISION_PRIMARY_PROVIDER=gemini
AI_VISION_FALLBACK_PROVIDER=openai

# Live/realtime routing. This exposes names, never credentials.
AI_LIVE_DEFAULT_PROVIDER=openai
AI_OPENAI_LIVE_ENABLED=true
AI_GEMINI_LIVE_ENABLED=true
AI_LIVE_SESSION_MAX_MINUTES=15
NEXT_PUBLIC_AI_LIVE_PROVIDERS=openai,gemini

# Existing Supabase variables remain.
SUPABASE_TEST_URL=
SUPABASE_TEST_PUBLISHABLE_KEY=
SUPABASE_TEST_SECRET_KEY=

# Recipe source allowlists live in the versioned server-only code module.
# Do not create a browser-visible or user-editable allowlist variable.

# Worker identity and polling.
RECIPE_WORKER_ID=
RECIPE_WORKER_POLL_MS=10000

# Transcription configuration, server only.
TRANSCRIPTION_PROVIDER=
TRANSCRIPTION_API_KEY=

# Default 50 weighted units/day.
AI_DAILY_LIMIT=50
```

Replace the existing global `AI_PROVIDER`, `GOOGLE_MODEL`, `OPENAI_MODEL`,
`GOOGLE_LIVE_MODEL`, and `NEXT_PUBLIC_VOICE_PROVIDER` settings with the
capability-specific settings above. Preserve the remote evaluation runner and
its `google-lite` comparison alias as a test-only configuration adapter.
`NEXT_PUBLIC_AI_LIVE_PROVIDERS` contains only provider names. Do not create
`NEXT_PUBLIC_` variants of any provider key, model ID, voice, worker secret,
test secret, or source allowlist.

## 15. Test strategy and exact acceptance cases

### 15.1 Unit tests

Cover:

- Every request/response Zod schema and unknown-field rejection.
- Pantry name normalization and atomic merge input.
- Exact source-host and YouTube-ID allowlist parsing, rejection before fetch,
  and redirect/private-address denial.
- Existing import/edit/adapt results becoming drafts rather than direct recipe
  inserts; manual owner edits that change safety-relevant fields revalidate.
- Private-media path ownership, public recipe-image migration classification,
  and rejection of new user writes to the public bucket.
- Canonical recipe v2, ingredient references, contiguous steps, and migration
  of all six seeded recipes.
- Allergen aliases/compound mappings and unknown-compound blocking.
- Deterministic safety rules and high-risk temperature checkpoints.
- Stored-recipe hard filters, score calculation, model-ID validation, and
  deterministic fallback.
- Quota weights, invalid limit fallback, no double charge on idempotency, and
  quota-provider errors.
- YouTube URL-to-ID parsing for supported URL shapes and exact allowlist checks.
- Job transitions, lease expiry/reclaim, retry ceiling, cancellation, and
  invalid transition rejection.
- Agent report validation, disagreement, one revision only, critical blocks,
  citation domain validation, and refusal to accept unverified drafts.
- Capability routing for both providers, eligible versus ineligible fallback,
  one-attempt fallback, and the generator/final-verifier provider invariant.
- OpenAI and Gemini live-event normalization, credential-expiry handling,
  provider switching, and transcript disposal.
- Session optimistic locking, exact completion, and adaptation validation.
- Error redaction and telemetry fields.

No ordinary unit/CI test calls a real AI provider.

### 15.2 Supabase integration tests

Run against a dedicated hosted test project, never production. CI secrets use
the `SUPABASE_TEST_*` variables. Setup creates unique confirmed users through the
admin API; teardown removes only objects/users created by that run.

Required cases:

1. Profile trigger creates one profile per auth user.
2. A can CRUD A's pantry; B cannot read/update/delete A's row or insert with A's
   ID.
3. A can upload/download A's private object; B cannot download/list it or upload
   into A's path; anonymous access fails.
4. Quota rows cannot be changed through an authenticated user client.
5. Shared recipes are readable; private A recipes/drafts, source objects,
   checkpoint paths, feedback, and session events are invisible to B.
6. Draft acceptance is owner-only, requires passing verification, is atomic,
   and is idempotent.
7. Only one active draft and one active cooking session exist per user.
8. Session version conflicts do not overwrite newer progress.
9. Completing one session never completes another user's or another session.
10. Cleanup removes expired objects but not fresh or differently prefixed
    objects.
11. URL/video imports reject every non-allowlisted source before network fetch;
    the exact approved host/ID succeeds only in the opt-in provider suite.
12. The public `recipe-images` audit finds no user-prefixed object after the
    migration procedure; catalogue-only public paths remain readable.

### 15.3 Required Playwright spike

Use two isolated browser contexts and the same hosted test project:

1. Admin setup creates confirmed users A and B with unique run IDs.
2. A signs in through `/login`.
3. A adds one ingredient through `/kitchen` and sees it.
4. A calls `GET /api/pantry-items`: status `200`, item present, and all returned
   rows belong to A at the database level.
5. Anonymous context calls the route: `401`.
6. B signs in and calls the same route: `200`, A's item absent.
7. Direct B client attempts select/update/delete/foreign insert against A's item
   and observes empty affected rows or an RLS error.
8. A uploads a tiny committed JPEG fixture to its path and downloads it.
9. B and anonymous clients cannot download it; B cannot list A's folder or
   upload into it.
10. `afterAll` deletes the exact fixture object and test users even after a
    failed assertion.

CI output may show truncated test user/item IDs and pass/fail results. It must
never print passwords, JWTs, keys, or signed URLs.

### 15.4 Cooking and AI integration tests

- Recommendation route ignores spoofed browser inventory/profile fields because
  those fields are not in its schema.
- A hard allergy conflict never reaches the model ranking call.
- Only returned candidate IDs can appear in an AI-ranked response.
- Assistant ownership and session-derived context are enforced.
- Suggested assistant actions do nothing before explicit acceptance.
- Feedback changes later score inputs without mutating explicit preferences.
- Stored-first recommendations make at most one AI call.
- Import, edit, and adaptation routes load the owned source record and cannot
  use browser-provided recipe context to access another user's data.
- Step-check rejects an unowned session/image path and stores only a private
  path plus bounded structured event data.
- Generated recipes execute generator, three parallel verifiers, adjudicator,
  and optional final verifier; acceptance remains impossible until all pass.
- The generation job uses the provider assignments in section 8.1. A fixture
  that forces one revision proves that the effective generator and final
  verifier are different providers.
- Live-session creation returns `401` anonymously, `404` for another user's
  session, and no credential when quota or provider policy rejects the request.
- Returned live credentials are short-lived and responses/bundles contain no
  standard OpenAI or Gemini key.
- A live action proposal cannot mutate progress or a recipe until the user
  confirms it through a protected action.
- A failed or rejected draft never appears in recommendations.

### 15.5 Provider smoke tests and evaluations

Provider tests are opt-in and run only with dedicated low-spend keys:

- One labelled kitchen image per supported vision provider.
- One recipe ranking and one assistant question through each text provider.
- One complete verified generation job using the cross-provider role matrix.
- One short OpenAI Realtime connection and one short Gemini Live connection,
  each using its ephemeral credential and producing one normalized event.
- One short allowlisted video transcription in a controlled test environment.

Evaluation datasets must measure allergen exclusion, equipment/time/skill fit,
pantry coverage, scan precision/recall, structured recipe validity, unsafe
temperature blocking, citation allowlisting, beginner clarity, latency, tokens,
and weighted cost.

### 15.6 Verification commands

On Windows use:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:e2e:spike
npm.cmd run build
npm.cmd run eval
```

`eval` and real-provider smoke tests remain explicitly opt-in.

## 16. Deployment and rollout

1. Provision separate Supabase test and production projects.
2. Apply migrations to test in order and generate TypeScript database types.
3. Run unit, integration, and spike E2E suites.
4. Deploy the web app with the code allowlist empty and verify
   auth/pantry/scan/recommend/cook flows.
5. Deploy one worker instance and verify job leases, cleanup, and telemetry.
6. Enable OpenAI Live, run its credential and connection smoke tests, then
   enable Gemini Live separately after accepting its Preview dependency.
7. Populate the exact externally approved video-ID allowlist and redeploy.
8. Run the controlled allowlisted-video smoke test.
9. Enable recipe generation after multi-agent and deterministic safety evals
   pass the agreed dataset with zero hard-constraint violations.
10. Monitor AI error rate by provider/capability, fallback rate, p95 text and
    live connection latency, live close reasons, daily quota use, blocked
    recipes, worker lease age, retry count, and stale-media cleanup failures.

Rollback is additive: disable generation/YouTube feature entry points, stop the
worker, and leave schema/data intact. Do not roll back by dropping populated
tables or buckets.

## 17. Definition of done

The backend is complete for v1 only when all of the following are true:

- The Phase 0 two-user spike passes in CI and is reproducible manually.
- Every user table and private bucket has an automated cross-user denial test.
- The browser cannot choose the identity, pantry/profile context, current recipe
  context, verification status, quota count, or job state.
- Kitchen scans store nothing until confirmation and never erase pantry items.
- Recommendations apply hard constraints before AI and return stored recipes.
- Generated recipes cannot be accepted without deterministic checks, all
  required agent reports, admissible citations, and explicit user acceptance.
- Cooking progress survives refresh and updates only the exact owned session.
- OpenAI Realtime and Gemini Live both work through short-lived credentials;
  typed/browser speech fallback works when either is disabled or unavailable.
- Voice audio, transcript text, SDP, and ephemeral credentials are not stored
  or logged, and live action proposals cannot bypass explicit acceptance.
- Feedback/history influences later ranking without silently editing the profile.
- Raw media/transcripts meet the deletion guarantees in section 12.
- No provider/service key appears in a browser bundle.
- Lint, typecheck, unit tests, integration tests, E2E spike, and build pass.

## 18. Explicit non-goals

Do not add these to v1:

- Social login, magic links, MFA, or role-based administration.
- An in-app approval/evidence workflow for YouTube videos.
- Arbitrary webpage or arbitrary YouTube ingestion.
- Public user-generated recipe publishing or social features.
- Redis, Kafka, or a separate commercial queue.
- Persistent voice recordings or full assistant transcripts.
- PSTN/SIP calling, background voice sessions, or cross-device live handoff.
- Automatic preference changes inferred by an LLM.
- A human-moderation dashboard.

## 19. Primary implementation references

- [Next.js authentication and per-entry-point authorization](https://nextjs.org/docs/app/guides/authentication)
- [Supabase SSR client and proxy guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs)
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase private buckets and upload limits](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Supabase Storage object ownership](https://supabase.com/docs/guides/storage/security/ownership)
- [YouTube API developer policies](https://developers.google.com/youtube/terms/developer-policies)
- [YouTube Terms of Service](https://www.youtube.com/t/terms)
- [SFA food allergy and cross-contact guidance](https://www.sfa.gov.sg/food-safety-tips/food-risk-concerns/risk-at-a-glance/food-allergy-in-individuals)
- [OpenAI Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create)
- [OpenAI Realtime API](https://developers.openai.com/api/docs/guides/realtime)
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini Live ephemeral tokens](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens)
- [Gemini Live WebSocket API](https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket)
