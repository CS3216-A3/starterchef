-- Per-user daily AI usage quota for the safety & security milestone.
-- Apply after migrations 0001–0003.

create table public.ai_usage_quota (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  date date not null default current_date,
  count int not null default 0 check (count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.ai_usage_quota enable row level security;

-- Users may only see/modify their own row when using the auth client.
create policy "ai_usage_quota: own row only" on public.ai_usage_quota
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Atomic increment / daily reset. The route helper calls this via the
-- service-role (admin) client, so direct calls from anonymous or authenticated
-- users are blocked below.
create or replace function public.increment_ai_usage(p_user_id uuid)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.ai_usage_quota (user_id, date, count)
  values (p_user_id, current_date, 1)
  on conflict (user_id) do update
    set count = case
                  when ai_usage_quota.date = current_date then ai_usage_quota.count + 1
                  else 1
                end,
        date = current_date,
        updated_at = now()
  returning count into v_count;

  return v_count;
end;
$$;

-- Only the service role may invoke this function.
grant execute on function public.increment_ai_usage(uuid) to service_role;
revoke execute on function public.increment_ai_usage(uuid) from public, anon, authenticated;
