# Rate Limiting Plan — /api/ai/* Safety & Security Milestone

## 1. Routes to protect

All four routes under `/api/ai/*` invoke paid or rate-sensitive AI providers and must be protected:

| Route                           | What it does                                                     | Why it needs a limit                                                       |
| ------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `POST /api/ai/kitchen-scan`     | Image → detected ingredients/equipment                           | Vision/object-generation calls are expensive and can burn credits quickly. |
| `POST /api/ai/suggest-recipes`  | Inventory/preferences → ranked recipes                           | Moderate cost, but easily scriptable with arbitrary payloads.              |
| `POST /api/ai/assistant`        | In-cooking Q&A                                                   | Chat-like endpoint; repeated calls during cooking could exceed budget.     |
| `POST /api/ai/realtime/session` | Creates a native-audio session token (OpenAI) or config (Gemini) | Creating sessions/tokens has a per-request cost and must not be farmed.    |

Scope for this milestone: **authenticated users only**. The app shell routes already require auth, and the AI endpoints are called from those pages. Anonymous requests will receive `401 Unauthorized`; they are not counted against any quota.

## 2. Rate-limit strategy

### Preferred: per-user daily counter in Supabase

Use a single shared daily counter per user stored in Supabase. This keeps state consistent across serverless invocations, requires no extra infrastructure, and is easy to audit.

Proposed table (added in migration `0004_ai_usage_quota.sql`):

```sql
create table public.ai_usage_quota (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  date date not null default current_date,
  count int not null default 0 check (count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.ai_usage_quota enable row level security;

-- Users can only read their own row.
create policy "ai_usage_quota: own row only" on public.ai_usage_quota
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Operation in `src/lib/rate-limit.ts`:

1. Read the existing row for `user_id`.
2. If no row or `date != current_date`, insert/reset with `count = 0`.
3. Atomically increment `count` with an optimistic upsert (`on conflict ... do update set count = ...`).
4. Compare `count` against a configurable limit.
5. If `count > limit`, return rate-limit metadata; the route returns `429` **without** calling the AI provider.

The counter is incremented **before** the AI call so that a retried request that already exhausted the quota keeps the count correct. The check-and-increment is implemented as an upsert to be safe under concurrent Edge Function/Node.js invocations.

### Daily limits

For the milestone we use a single, generous default that applies to all AI endpoints combined:

- `AI_DAILY_LIMIT` env var, default **50 requests/user/day**.

A combined counter is simplest and avoids gaming individual endpoints. Later milestones can split by endpoint if telemetry shows abuse patterns.

### Alternatives (briefly)

- **Upstash Redis Rate Limit** (`@upstash/ratelimit`): sliding-window, very accurate, but adds a third-party dependency and a new secret. Not chosen because Supabase already meets the assignment requirement and keeps the stack smaller.
- **In-memory Map in the route handler**: simple but wrong for serverless/Edge; counts reset per invocation and do not protect against distributed abuse.
- **Vercel KV / Redis**: similar accuracy to Upstash; also extra infra. Mentioned in docs as a future production scaling option.

## 3. Behavior on limit exceeded

When a user is over quota:

- HTTP `429 Too Many Requests`
- JSON body:
  ```json
  {
    "error": "Daily AI request limit reached",
    "limit": 50,
    "remaining": 0,
    "retryAfter": 3600
  }
  ```
- Response header `Retry-After: <seconds-until-midnight-UTC>` (or a fixed 1-hour default if calculation is complex).
- The AI provider is **not** called, so no API cost is incurred.

On success the route may still return the normal AI response; the helper can optionally return `remaining` for UI hints, but that is out of scope for this milestone.

## 4. Unauthenticated / anonymous requests

- The helper requires a `user_id`. If the request has no authenticated user, the route returns `401 Unauthorized` immediately.
- This matches the current app design: AI endpoints are called from authenticated app-shell pages, and the proxy already redirects anonymous users away from those pages.
- A future enhancement could add a stricter IP-based anonymous limit, but that is **not** implemented here to keep the milestone focused and avoid blocking legitimate unauthenticated landing-page demos.

## 5. Implementation sketch

### New files

- `src/lib/rate-limit.ts` — reusable helper `checkRateLimit(userId): Promise<RateLimitResult>`.
- `supabase/migrations/0004_ai_usage_quota.sql` — creates `public.ai_usage_quota` with RLS.
- `tests/rate-limit.test.ts` — unit tests for the helper using a mocked Supabase client.

### Modified files

- `src/app/api/ai/kitchen-scan/route.ts`
- `src/app/api/ai/suggest-recipes/route.ts`
- `src/app/api/ai/assistant/route.ts`
- `src/app/api/ai/realtime/session/route.ts`
  - Each route gets an auth check, calls `checkRateLimit`, and returns 401/429 before the AI call.
- `.env.example` — add optional `AI_DAILY_LIMIT`.
- `README.md` — document the new env var and migration.

### Admin client choice

Routes use `createAdminClient()` from `src/lib/supabase/admin.ts` to upsert/read the quota table. The admin client bypasses RLS, which is acceptable because:

- The route is a trusted server context.
- The helper explicitly passes the authenticated `user_id` and never uses anon/public writes, preventing users from tampering with each other's counters.

If preferred, the server client could be used with an RLS policy that allows `authenticated` users to update their own row. The admin client is chosen because it makes the helper self-contained and avoids relying on request-scoped cookie clients inside deeply nested utility functions.

## 6. Verification steps

1. Apply `supabase/migrations/0004_ai_usage_quota.sql` to the project.
2. Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
3. Optionally run the AI smoke tests with `RUN_AI_SMOKE=true npm test` after setting a provider key (be careful with credits).
4. Do **not** push to the remote repository.
