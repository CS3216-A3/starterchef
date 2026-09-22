-- Session memory: the event log that powers "review what happened" and
-- cross-session learning (the multimodal-aid selling point).
--
-- Also reconciles drift: the deployed recipe_feedback predates 0007 and is
-- missing the feedback columns the app writes; cooking_sessions gets a
-- recipe_id link and an AI recap column.

-- ── recipe_feedback reconciliation ─────────────────────────────────────
alter table public.recipe_feedback
  add column if not exists recipe_id uuid references public.recipes (id) on delete cascade;
alter table public.recipe_feedback
  add column if not exists substitutions_made text[] not null default '{}';
alter table public.recipe_feedback
  add column if not exists equipment_adjusted text[] not null default '{}';
alter table public.recipe_feedback
  add column if not exists scaled_servings int;
alter table public.recipe_feedback
  add column if not exists would_cook_again boolean;

-- ── cooking_sessions: link to recipe + AI recap ────────────────────────
alter table public.cooking_sessions
  add column if not exists recipe_id uuid references public.recipes (id) on delete set null;
alter table public.cooking_sessions
  add column if not exists summary jsonb;

create index if not exists cooking_sessions_recipe_idx
  on public.cooking_sessions (user_id, recipe_id);

-- ── session_events: append-only timeline ───────────────────────────────
-- Every meaningful thing that happens while cooking lands here: step
-- navigation, text/voice Q&A, camera checkpoint results, step photos and
-- end-of-cook feedback. Payloads stay small (text + urls, never blobs).
create table if not exists public.session_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.cooking_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  step_index int,
  kind text not null check (kind in (
    'session_started',
    'step_entered',
    'qa',
    'photo_check',
    'photo_upload',
    'feedback'
  )),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists session_events_session_idx
  on public.session_events (session_id, created_at);
create index if not exists session_events_user_idx
  on public.session_events (user_id, created_at);

alter table public.session_events enable row level security;

drop policy if exists "session_events: read own rows" on public.session_events;
drop policy if exists "session_events: insert into own session" on public.session_events;

create policy "session_events: read own rows"
  on public.session_events
  for select
  using (auth.uid() = user_id);

-- Inserts must target a session the caller actually owns — prevents
-- writing events into someone else's timeline.
create policy "session_events: insert into own session"
  on public.session_events
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.cooking_sessions cs
      where cs.id = session_id and cs.user_id = auth.uid()
    )
  );

grant select, insert on table public.session_events to authenticated;
grant select, insert, update, delete on table public.session_events to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
