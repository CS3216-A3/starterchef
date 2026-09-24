# Phase 3 stabilization and Phase 4 rollout

Keep migrations append-only. Apply `0028_phase3_operational_fixes.sql` and
`0029_session_integrity_reconciliation.sql` to a disposable or staging
Supabase project first. Do not reset a project that contains valuable data.

## Existing-project preflight

`0024_session_integrity_and_retention.sql` creates the active-session unique
index. If it has not yet been applied, reconcile duplicates _before_ applying
`0024`. If it has already been applied, still run the read-only checks below
before `0028` and `0029`:

```sql
select user_id, count(*) from public.cooking_sessions
where status = 'in_progress' group by user_id having count(*) > 1;

select indexname from pg_indexes where schemaname = 'public'
and tablename = 'cooking_sessions'
and indexname = 'cooking_sessions_one_active_per_user';
```

On a project with duplicates, inspect the affected rows, then keep each
user's newest session and abandon the older ones in a transaction:

```sql
begin;
with ranked as (
  select id, row_number() over (
    partition by user_id order by started_at desc, id desc
  ) as n from public.cooking_sessions where status = 'in_progress'
)
update public.cooking_sessions s
set status = 'abandoned', completed_at = coalesce(s.completed_at, now())
from ranked r where s.id = r.id and r.n > 1;
commit;
```

Repeat the duplicate query; it must return no rows. Confirm the partial index
exists after `0024`. Migration `0029` repeats reconciliation defensively.
Migration `0028` similarly retains the newest active recipe draft and marks
older duplicates retryable with a rotated workflow attempt ID.

## Vercel configuration

Set `AI_PROVIDER` and its matching text-model API key; leave
`RECIPE_VERIFICATION_ROUTING=single` for production. Set `OPENAI_API_KEY`,
`OPENAI_REALTIME_MODEL`, `GOOGLE_GENERATIVE_AI_API_KEY`, and
`AI_GEMINI_LIVE_ENABLED=true` for voice fallback. Set `CRON_SECRET` and keep
the daily retention cron enabled. Standard provider API keys, Supabase secret
keys, and the cron secret are server-only; only short-lived realtime credentials
reach the browser. Test Gemini failure injection in Preview, not production.

## Release gate

Run `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd test`,
`npm.cmd run test:security:integration`, and `npm.cmd run build` before any
commit. The two-account integration tests require staging test-user
credentials and may otherwise be skipped; a skipped suite is not security
verification. On staging, test idempotent drafts and quota, public and private
URL rejection, two-account isolation, refresh and two-tab conflicts, private
checkpoint preview, accepted proposals, exact-session completion, and feedback.
Test OpenAI voice over HTTPS and one pre-connection Gemini fallback in Preview.
Check that stopping voice clears transcripts and microphone indicators, and
that the retention job removes expired checkpoint objects without deleting
session summaries or feedback. Do not enable production Phase 4 voice until
both provider paths pass the manual checks.
