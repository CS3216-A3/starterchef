create table public.recipe_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('generated','photo','youtube','adapted')),
  request jsonb not null default '{}'::jsonb,
  input_id uuid references public.recipe_inputs(id) on delete set null,
  input_sha256 text,
  canonical_recipe jsonb,
  verification jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','acquiring_source','extracting_or_generating','verifying','adjudicating','awaiting_user_acceptance','accepted','rejected','failed_retryable','failed_permanent','blocked')),
  failure_code text,
  idempotency_key uuid not null,
  quota_units integer not null default 0 check (quota_units >= 0),
  workflow_run_id text,
  retry_count integer not null default 0 check (retry_count between 0 and 2),
  accepted_recipe_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  unique(user_id, idempotency_key)
);
create index recipe_drafts_owner_recent_idx on public.recipe_drafts(user_id, created_at desc);
create index recipe_drafts_expiry_idx on public.recipe_drafts(expires_at) where status not in ('accepted','rejected');
alter table public.recipe_drafts enable row level security;
revoke all on public.recipe_drafts from anon, authenticated;
grant select on public.recipe_drafts to authenticated, service_role;
drop policy if exists "recipe_drafts: read own rows" on public.recipe_drafts;
create policy "recipe_drafts: read own rows" on public.recipe_drafts for select to authenticated using (auth.uid() = user_id);

alter table public.recipe_inputs add constraint recipe_inputs_consuming_draft_fkey
  foreign key (consuming_draft_id) references public.recipe_drafts(id) on delete set null;
alter table public.recipe_drafts add constraint recipe_drafts_accepted_recipe_fkey
  foreign key (accepted_recipe_id) references public.recipes(id) on delete set null;
alter table public.recipes add column if not exists accepted_draft_id uuid unique references public.recipe_drafts(id) on delete restrict;

-- The accepted output is immutable. Catalogue maintenance is unaffected.
create or replace function public.prevent_accepted_recipe_mutation() returns trigger
language plpgsql as $$ begin
  if old.accepted_draft_id is not null then raise exception 'accepted recipes are immutable' using errcode = '55000'; end if;
  return new;
end $$;
drop trigger if exists recipes_prevent_accepted_mutation on public.recipes;
create trigger recipes_prevent_accepted_mutation before update or delete on public.recipes
for each row execute function public.prevent_accepted_recipe_mutation();

create or replace function public.accept_recipe_draft(draft_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); v_draft public.recipe_drafts%rowtype; v_recipe uuid; v_title text; v_slug text; v_n integer := 2;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into v_draft from public.recipe_drafts where id = draft_id for update;
  if not found or v_draft.user_id <> v_user then raise exception 'draft not found' using errcode = 'P0002'; end if;
  if v_draft.accepted_recipe_id is not null then return v_draft.accepted_recipe_id; end if;
  if v_draft.status <> 'awaiting_user_acceptance' or coalesce(v_draft.verification->>'verdict','') <> 'pass' or v_draft.canonical_recipe is null then
    raise exception 'draft is not eligible for acceptance' using errcode = '22023';
  end if;
  v_title := left(coalesce(nullif(btrim(v_draft.canonical_recipe->>'title'), ''), 'Untitled recipe'), 120);
  v_slug := lower(regexp_replace(v_title, '[^a-z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug); if v_slug = '' then v_slug := 'recipe'; end if;
  while exists(select 1 from public.recipes where slug = v_slug) loop v_slug := left(trim(both '-' from lower(regexp_replace(v_title, '[^a-z0-9]+', '-', 'g'))), 100) || '-' || v_n; v_n := v_n + 1; end loop;
  insert into public.recipes(slug,title,description,minutes,difficulty,servings,why_good,icon,image_tint,ingredients,equipment,steps,tags,source,user_id,parent_recipe_id,is_personalized,accepted_draft_id)
  values (v_slug, v_title, coalesce(v_draft.canonical_recipe->>'description',''), greatest(1,coalesce((v_draft.canonical_recipe->>'minutes')::int,1)), coalesce(v_draft.canonical_recipe->>'difficulty','easy'), greatest(1,coalesce((v_draft.canonical_recipe->>'servings')::int,1)), coalesce(v_draft.canonical_recipe->>'whyGood',''), 'cooking-pot','from-oat to-oat-dark', coalesce(array(select jsonb_array_elements_text(v_draft.canonical_recipe->'ingredients')), '{}'), coalesce(array(select jsonb_array_elements_text(v_draft.canonical_recipe->'equipment')), '{}'), coalesce(v_draft.canonical_recipe->'steps','[]'::jsonb), coalesce(array(select jsonb_array_elements_text(v_draft.canonical_recipe->'tags')), '{}'), 'verified-draft', v_user, null, v_draft.kind = 'adapted', v_draft.id) returning id into v_recipe;
  update public.recipe_drafts set accepted_recipe_id = v_recipe, status = 'accepted', updated_at = now(), expires_at = now() + interval '30 days' where id = v_draft.id;
  return v_recipe;
end $$;
revoke execute on function public.accept_recipe_draft(uuid) from public, anon;
grant execute on function public.accept_recipe_draft(uuid) to authenticated;
