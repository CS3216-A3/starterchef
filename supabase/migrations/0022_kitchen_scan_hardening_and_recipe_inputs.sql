-- Security boundary for image-bearing requests.  The application, not the
-- browser, creates metadata rows and object paths before any provider work.

alter table public.kitchen_scans
  add column if not exists object_sha256 text;

-- A scan result may only contain one candidate for each opaque candidate id.
-- This backs up the API's Zod validation for callers that reach the RPC
-- directly.
create or replace function public.apply_kitchen_scan(scan_id uuid, accepted jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid(); v_scan public.kitchen_scans%rowtype;
  v_item jsonb; v_candidate jsonb; v_items jsonb := '[]'::jsonb;
  v_result jsonb; v_candidate_id text; v_name text; v_quantity text;
  v_expires_on text; v_seen_ids text[] := '{}'; v_candidate_ids text[] := '{}';
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if jsonb_typeof(accepted) <> 'array' or jsonb_array_length(accepted) < 1 then
    raise exception 'at least one candidate must be accepted' using errcode = '22023';
  end if;
  select * into v_scan from public.kitchen_scans where id = scan_id for update;
  if not found or v_scan.user_id <> v_user_id then raise exception 'scan not found' using errcode = 'P0002'; end if;
  if v_scan.status = 'applied' then raise exception 'scan already applied' using errcode = '23505'; end if;
  if v_scan.status <> 'awaiting_confirmation' or v_scan.expires_at <= now() then
    if v_scan.expires_at <= now() then update public.kitchen_scans set status = 'expired', updated_at = now() where id = scan_id; end if;
    raise exception 'scan cannot be applied' using errcode = '22023';
  end if;
  for v_candidate in select value from jsonb_array_elements(v_scan.candidates) loop
    v_candidate_id := v_candidate->>'id';
    if v_candidate_id is null or v_candidate_id = any(v_candidate_ids) then
      raise exception 'duplicate or invalid stored candidate' using errcode = '22023';
    end if;
    v_candidate_ids := array_append(v_candidate_ids, v_candidate_id);
  end loop;
  for v_item in select value from jsonb_array_elements(accepted) loop
    if jsonb_typeof(v_item) <> 'object' or (v_item - array['id','name','quantity','expiresOn']) <> '{}'::jsonb then
      raise exception 'invalid accepted candidate fields' using errcode = '22023';
    end if;
    v_candidate_id := v_item->>'id';
    if v_candidate_id is null or v_candidate_id = any(v_seen_ids) then raise exception 'duplicate candidate' using errcode = '22023'; end if;
    v_seen_ids := array_append(v_seen_ids, v_candidate_id);
    select value into v_candidate from jsonb_array_elements(v_scan.candidates) where value->>'id' = v_candidate_id;
    if v_candidate is null then raise exception 'candidate does not belong to scan' using errcode = '22023'; end if;
    v_name := btrim(coalesce(v_item->>'name', v_candidate->>'name', ''));
    v_quantity := nullif(btrim(coalesce(v_item->>'quantity', v_candidate->>'quantity', '')), '');
    v_expires_on := nullif(coalesce(v_item->>'expiresOn', v_candidate->>'expiresOn', ''), '');
    if char_length(v_name) not between 1 and 120 or (v_quantity is not null and char_length(v_quantity) > 120)
       or (v_expires_on is not null and (v_candidate->>'kind' <> 'ingredient' or v_expires_on !~ '^\\d{4}-\\d{2}-\\d{2}$')) then
      raise exception 'invalid candidate edit' using errcode = '22023';
    end if;
    v_items := v_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('kind', v_candidate->>'kind', 'name', v_name, 'quantity', v_quantity, 'expiresOn', v_expires_on, 'icon', v_candidate->>'icon', 'source', 'scan')));
  end loop;
  select public.merge_kitchen_items(v_items) into v_result;
  update public.kitchen_scans set accepted = apply_kitchen_scan.accepted, status = 'applied', updated_at = now() where id = scan_id;
  return v_result;
end $$;

create table if not exists public.recipe_inputs (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  object_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 4194304),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  consuming_draft_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index if not exists recipe_inputs_owner_expiry_idx on public.recipe_inputs(user_id, expires_at);
alter table public.recipe_inputs enable row level security;
revoke all on public.recipe_inputs from anon, authenticated;
grant select on public.recipe_inputs to authenticated, service_role;
drop policy if exists "recipe_inputs: read own metadata" on public.recipe_inputs;
create policy "recipe_inputs: read own metadata" on public.recipe_inputs for select to authenticated using (auth.uid() = user_id);

-- Vercel Functions have a 4.5 MiB request limit. Keep a margin for multipart
-- framing and make the bucket agree with the route limit.
update storage.buckets set file_size_limit = 4194304,
  allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'recipe-inputs';
