-- Phase 0/1 security primitives. This migration is forward-only and refuses
-- to proceed when existing pantry data cannot satisfy the new constraints.

do $$
begin
  if exists (
    select 1 from public.kitchen_items
    where btrim(name) = ''
       or char_length(btrim(name)) > 120
       or char_length(btrim(coalesce(quantity, ''))) > 120
       or (kind = 'equipment' and expires_on is not null)
  ) then
    raise exception 'kitchen_items contains invalid rows; run docs/security-preflight.sql';
  end if;

  if exists (
    select 1 from public.kitchen_items
    group by user_id, kind, lower(btrim(name))
    having count(*) > 1
  ) then
    raise exception 'kitchen_items contains normalized duplicates; reconcile before migrating';
  end if;
end
$$;

update public.kitchen_items
set name = btrim(name),
    quantity = nullif(btrim(quantity), '');

alter table public.kitchen_items
  drop constraint if exists kitchen_items_name_valid,
  drop constraint if exists kitchen_items_quantity_valid,
  drop constraint if exists kitchen_items_expiry_valid;

alter table public.kitchen_items
  add constraint kitchen_items_name_valid
    check (name = btrim(name) and char_length(name) between 1 and 120),
  add constraint kitchen_items_quantity_valid
    check (quantity is null or (quantity = btrim(quantity) and char_length(quantity) between 1 and 120)),
  add constraint kitchen_items_expiry_valid
    check (kind = 'ingredient' or expires_on is null);

drop index if exists public.kitchen_items_user_kind_name_idx;
create unique index kitchen_items_user_kind_normalized_name_idx
  on public.kitchen_items (user_id, kind, lower(btrim(name)));

drop policy if exists "profiles: own row only" on public.profiles;
drop policy if exists "profiles: select own row" on public.profiles;
drop policy if exists "profiles: update own row" on public.profiles;
create policy "profiles: select own row" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles: update own row" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "kitchen_items: own rows only" on public.kitchen_items;
drop policy if exists "kitchen_items: select own rows" on public.kitchen_items;
drop policy if exists "kitchen_items: insert own rows" on public.kitchen_items;
drop policy if exists "kitchen_items: update own rows" on public.kitchen_items;
drop policy if exists "kitchen_items: delete own rows" on public.kitchen_items;
create policy "kitchen_items: select own rows" on public.kitchen_items
  for select using (auth.uid() = user_id);
create policy "kitchen_items: insert own rows" on public.kitchen_items
  for insert with check (auth.uid() = user_id);
create policy "kitchen_items: update own rows" on public.kitchen_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "kitchen_items: delete own rows" on public.kitchen_items
  for delete using (auth.uid() = user_id);

drop policy if exists "ai_usage_quota: own row only" on public.ai_usage_quota;
drop policy if exists "ai_usage_quota: select own row" on public.ai_usage_quota;
create policy "ai_usage_quota: select own row" on public.ai_usage_quota
  for select using (auth.uid() = user_id);

drop policy if exists "ai_calls: read own rows" on public.ai_calls;
create policy "ai_calls: read own rows" on public.ai_calls
  for select using (auth.uid() = user_id);

revoke all on table public.profiles from authenticated;
revoke all on table public.kitchen_items from authenticated;
revoke all on table public.ai_usage_quota from authenticated;
revoke all on table public.ai_calls from authenticated;
grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.kitchen_items to authenticated;
grant select on table public.ai_usage_quota to authenticated;
grant select on table public.ai_calls to authenticated;
alter default privileges in schema public
  revoke insert, update, delete on tables from authenticated;

create or replace function public.merge_kitchen_items(p_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_kind text;
  v_name text;
  v_quantity text;
  v_expires_on date;
  v_icon text;
  v_source text;
  v_row public.kitchen_items%rowtype;
  v_created boolean;
  v_result jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'items must be an array containing 1 to 100 entries' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or (v_item - array['kind','name','quantity','expiresOn','icon','source']) <> '{}'::jsonb then
      raise exception 'invalid pantry item fields' using errcode = '22023';
    end if;
    v_kind := v_item->>'kind';
    v_name := btrim(coalesce(v_item->>'name', ''));
    v_quantity := nullif(btrim(coalesce(v_item->>'quantity', '')), '');
    v_icon := nullif(btrim(coalesce(v_item->>'icon', '')), '');
    v_source := coalesce(v_item->>'source', 'manual');
    begin
      v_expires_on := nullif(v_item->>'expiresOn', '')::date;
    exception when others then
      raise exception 'expiresOn must be an ISO date' using errcode = '22023';
    end;

    if v_kind not in ('ingredient', 'equipment')
       or char_length(v_name) not between 1 and 120
       or (v_quantity is not null and char_length(v_quantity) > 120)
       or (v_kind = 'equipment' and v_expires_on is not null)
       or v_source not in ('manual', 'scan') then
      raise exception 'invalid pantry item' using errcode = '22023';
    end if;

    insert into public.kitchen_items (user_id, kind, name, quantity, expires_on, icon, source)
    values (v_user_id, v_kind, v_name, v_quantity, v_expires_on, v_icon, v_source)
    on conflict (user_id, kind, lower(btrim(name))) do update
      set quantity = excluded.quantity,
          expires_on = excluded.expires_on,
          icon = coalesce(excluded.icon, kitchen_items.icon),
          source = excluded.source
    returning kitchen_items.*, (xmax = 0) into v_row, v_created;

    v_result := v_result || jsonb_build_array(
      to_jsonb(v_row) || jsonb_build_object('created', v_created)
    );
  end loop;
  return v_result;
end
$$;

revoke execute on function public.merge_kitchen_items(jsonb) from public, anon;
grant execute on function public.merge_kitchen_items(jsonb) to authenticated;

create or replace function public.consume_ai_usage(
  p_user_id uuid,
  p_units integer,
  p_limit integer
)
returns table (allowed boolean, total integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_date date;
  v_count integer;
begin
  if p_user_id is null or p_units not between 1 and 100 or p_limit not between 1 and 100000 then
    raise exception 'invalid quota arguments' using errcode = '22023';
  end if;

  insert into public.ai_usage_quota (user_id, date, count)
  values (p_user_id, current_date, 0)
  on conflict (user_id) do nothing;

  select q.date, q.count into v_date, v_count
  from public.ai_usage_quota q
  where q.user_id = p_user_id
  for update;

  if v_date <> current_date then
    v_count := 0;
  end if;

  if v_count + p_units > p_limit then
    update public.ai_usage_quota
    set date = current_date, count = v_count, updated_at = now()
    where user_id = p_user_id;
    return query select false, v_count;
    return;
  end if;

  v_count := v_count + p_units;
  update public.ai_usage_quota
  set date = current_date, count = v_count, updated_at = now()
  where user_id = p_user_id;
  return query select true, v_count;
end
$$;

revoke execute on function public.increment_ai_usage(uuid) from public, anon, authenticated;
revoke execute on function public.consume_ai_usage(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_usage(uuid, integer, integer) to service_role;
