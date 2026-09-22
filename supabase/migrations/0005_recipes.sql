-- Recipe catalogue + per-user saved recipes.
-- Recipes are a shared, read-only catalogue (see supabase/seed/recipes.sql);
-- saved_recipes is the user's "keepers" list powering /recipes.

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  minutes int not null check (minutes > 0),
  difficulty text not null default 'easy'
    check (difficulty in ('easy', 'medium', 'hard')),
  servings int not null default 2 check (servings > 0),
  -- One warm sentence shown on the card ("Uses your eggs and tomatoes").
  why_good text not null default '',
  -- Lucide icon name (e.g. 'cooking-pot') — resolved client-side.
  icon text not null default 'cooking-pot',
  -- Tailwind gradient token pair, e.g. 'from-flame-soft to-oat'.
  image_tint text not null default 'from-oat to-oat-dark',
  ingredients text[] not null default '{}',
  equipment text[] not null default '{}',
  -- CookingStep[] matching src/lib/ai/schemas/cooking.ts (plus a per-step
  -- `ingredients` list for the "For this step" chips).
  steps jsonb not null default '[]',
  tags text[] not null default '{}',
  -- Provenance: where the recipe text came from.
  -- Keep empty or set to the actual source; do not invent a license.
  source text not null default '',
  created_at timestamptz not null default now()
);

create table public.saved_recipes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

alter table public.recipes enable row level security;
alter table public.saved_recipes enable row level security;

-- Catalogue is shared: any signed-in user can read it, nobody can write it
-- via the API (seeds are applied with the service role / SQL editor).
create policy "recipes: read by authenticated users" on public.recipes
  for select using (auth.role() = 'authenticated');

create policy "saved_recipes: own rows only" on public.saved_recipes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Merge-friendly uniqueness for kitchen items so scans upsert instead of
-- duplicating. Name matching is case-insensitive.
create unique index kitchen_items_user_kind_name_idx
  on public.kitchen_items (user_id, kind, lower(name));
