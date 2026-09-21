-- StarterChef initial schema.
-- Apply with: supabase db push  (or paste into the Supabase SQL editor)

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  dietary_restrictions text[] not null default '{}',
  allergies text[] not null default '{}',
  taste_preferences jsonb not null default '{}',
  skill_level text not null default 'beginner'
    check (skill_level in ('beginner', 'intermediate', 'advanced')),
  household_size int not null default 1 check (household_size > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.kitchen_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('ingredient', 'equipment')),
  name text not null,
  quantity text,
  expires_on date,
  source text not null default 'manual' check (source in ('manual', 'scan')),
  created_at timestamptz not null default now()
);
create index kitchen_items_user_idx on public.kitchen_items (user_id);
create index kitchen_items_expiry_idx on public.kitchen_items (user_id, expires_on)
  where kind = 'ingredient' and expires_on is not null;

create table public.cooking_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  recipe jsonb not null,
  current_step int not null default 1,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'abandoned')),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index cooking_sessions_active_idx
  on public.cooking_sessions (user_id) where status = 'in_progress';

create table public.recipe_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid references public.cooking_sessions (id) on delete set null,
  rating int check (rating between 1 and 5),
  notes text,
  -- Structured learnings the assistant records: dislikes, mistakes,
  -- successful substitutions. Feeds future recommendations.
  learned jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Per-call AI telemetry: latency + token usage for the optimization milestone.
create table public.ai_calls (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete set null,
  name text not null,
  provider text not null,
  model text not null,
  latency_ms int,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.kitchen_items enable row level security;
alter table public.cooking_sessions enable row level security;
alter table public.recipe_feedback enable row level security;
alter table public.ai_calls enable row level security;

create policy "profiles: own row only" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "kitchen_items: own rows only" on public.kitchen_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "cooking_sessions: own rows only" on public.cooking_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "recipe_feedback: own rows only" on public.recipe_feedback
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "ai_calls: read own rows" on public.ai_calls
  for select using (auth.uid() = user_id);
