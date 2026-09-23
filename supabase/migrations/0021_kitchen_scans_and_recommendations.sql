-- Phase 2: private, owner-bound kitchen scan records. Images stay in the
-- private kitchen-images bucket; this table deliberately never exposes paths.

create table if not exists public.kitchen_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  object_path text not null,
  idempotency_key uuid not null,
  candidates jsonb not null default '[]'::jsonb,
  accepted jsonb,
  status text not null default 'processing'
    check (status in ('processing', 'awaiting_confirmation', 'applied', 'failed', 'expired')),
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  unique (user_id, idempotency_key)
);

create index if not exists kitchen_scans_owner_recent_idx
  on public.kitchen_scans (user_id, created_at desc);
create index if not exists kitchen_scans_expiry_idx
  on public.kitchen_scans (expires_at)
  where status in ('processing', 'awaiting_confirmation');

alter table public.kitchen_scans enable row level security;
drop policy if exists "kitchen_scans: read own rows" on public.kitchen_scans;
create policy "kitchen_scans: read own rows" on public.kitchen_scans
  for select to authenticated using (auth.uid() = user_id);
revoke all on table public.kitchen_scans from anon, authenticated;
grant select on table public.kitchen_scans to authenticated, service_role;

create or replace function public.apply_kitchen_scan(scan_id uuid, accepted jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_scan public.kitchen_scans%rowtype;
  v_item jsonb;
  v_candidate jsonb;
  v_items jsonb := '[]'::jsonb;
  v_result jsonb;
  v_candidate_id text;
  v_name text;
  v_quantity text;
  v_expires_on text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if jsonb_typeof(accepted) <> 'array' or jsonb_array_length(accepted) < 1 then
    raise exception 'at least one candidate must be accepted' using errcode = '22023';
  end if;

  select * into v_scan from public.kitchen_scans where id = scan_id for update;
  if not found or v_scan.user_id <> v_user_id then
    raise exception 'scan not found' using errcode = 'P0002';
  end if;
  if v_scan.status = 'applied' then
    raise exception 'scan already applied' using errcode = '23505';
  end if;
  if v_scan.status <> 'awaiting_confirmation' or v_scan.expires_at <= now() then
    if v_scan.expires_at <= now() then
      update public.kitchen_scans set status = 'expired', updated_at = now() where id = scan_id;
    end if;
    raise exception 'scan cannot be applied' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(accepted)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or (v_item - array['id','name','quantity','expiresOn']) <> '{}'::jsonb then
      raise exception 'invalid accepted candidate fields' using errcode = '22023';
    end if;
    v_candidate_id := v_item->>'id';
    select value into v_candidate from jsonb_array_elements(v_scan.candidates)
      where value->>'id' = v_candidate_id;
    if v_candidate is null then
      raise exception 'candidate does not belong to scan' using errcode = '22023';
    end if;
    v_name := btrim(coalesce(v_item->>'name', v_candidate->>'name', ''));
    v_quantity := nullif(btrim(coalesce(v_item->>'quantity', v_candidate->>'quantity', '')), '');
    v_expires_on := nullif(coalesce(v_item->>'expiresOn', v_candidate->>'expiresOn', ''), '');
    if char_length(v_name) not between 1 and 120
       or (v_quantity is not null and char_length(v_quantity) > 120)
       or (v_expires_on is not null and (v_candidate->>'kind' <> 'ingredient' or v_expires_on !~ '^\\d{4}-\\d{2}-\\d{2}$')) then
      raise exception 'invalid candidate edit' using errcode = '22023';
    end if;
    v_items := v_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'kind', v_candidate->>'kind', 'name', v_name, 'quantity', v_quantity,
      'expiresOn', v_expires_on, 'icon', v_candidate->>'icon', 'source', 'scan'
    )));
  end loop;

  select public.merge_kitchen_items(v_items) into v_result;
  update public.kitchen_scans
  set accepted = apply_kitchen_scan.accepted, status = 'applied', updated_at = now()
  where id = scan_id;
  return v_result;
end
$$;

revoke execute on function public.apply_kitchen_scan(uuid, jsonb) from public, anon;
grant execute on function public.apply_kitchen_scan(uuid, jsonb) to authenticated;
