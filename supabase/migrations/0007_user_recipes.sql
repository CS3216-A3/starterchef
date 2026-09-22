-- Support user-imported recipes and personalised versions.
-- Recipes with user_id = NULL remain the shared demo/catalogue.

alter table public.recipes
  add column if not exists user_id uuid references public.profiles (id) on delete cascade;

alter table public.recipes
  add column if not exists parent_recipe_id uuid references public.recipes (id) on delete set null;

alter table public.recipes
  add column if not exists is_personalized boolean not null default false;

-- Existing seeded rows stay catalogue-only.
update public.recipes set user_id = null where user_id is null;

-- Drop the old read-only catalogue policy and replace with one that lets users
-- read catalogue rows plus their own imported/personalised recipes.
drop policy if exists "recipes: read by authenticated users" on public.recipes;

create policy "recipes: read catalogue and own rows"
  on public.recipes
  for select
  using (auth.role() = 'authenticated' and (user_id is null or user_id = auth.uid()));

create policy "recipes: insert own rows"
  on public.recipes
  for insert
  with check (auth.uid() = user_id);

create policy "recipes: update own rows"
  on public.recipes
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "recipes: delete own rows"
  on public.recipes
  for delete
  using (auth.uid() = user_id);

-- Feedback captured after cooking a recipe, used to improve future suggestions.
create table public.recipe_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  rating int check (rating >= 1 and rating <= 5),
  substitutions_made text[] not null default '{}',
  equipment_adjusted text[] not null default '{}',
  scaled_servings int,
  would_cook_again boolean,
  notes text not null default '',
  created_at timestamptz not null default now()
);

alter table public.recipe_feedback enable row level security;

create policy "recipe_feedback: own rows only"
  on public.recipe_feedback
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Ensure the authenticated app role and service_role can read/write recipe
-- tables. RLS still filters user-visible rows.
grant select, insert, update, delete on table public.recipes to authenticated, service_role;
grant select, insert, update, delete on table public.saved_recipes to authenticated, service_role;
grant select, insert, update, delete on table public.recipe_feedback to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
