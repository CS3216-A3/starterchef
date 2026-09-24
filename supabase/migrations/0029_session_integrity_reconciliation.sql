-- Additive Phase 4 reconciliation. Never rewrite 0024 on deployed projects.
with ranked as (
  select id, row_number() over (partition by user_id order by started_at desc, id desc) as n
  from public.cooking_sessions where status = 'in_progress'
)
update public.cooking_sessions s set status = 'abandoned', completed_at = coalesce(s.completed_at, now())
from ranked r where s.id = r.id and r.n > 1;

create unique index if not exists cooking_sessions_one_active_per_user
  on public.cooking_sessions(user_id) where status = 'in_progress';
alter table public.cooking_sessions add column if not exists updated_at timestamptz not null default now();
alter table public.cooking_sessions add column if not exists timer_state jsonb not null default '{"status":"idle"}'::jsonb;
alter table public.cooking_sessions add constraint cooking_sessions_timer_state_object
  check (jsonb_typeof(timer_state) = 'object') not valid;

create table if not exists public.cooking_checkpoints (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cooking_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  step_index integer not null check (step_index > 0),
  object_path text not null,
  verdict jsonb not null check (jsonb_typeof(verdict) = 'object'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index if not exists cooking_checkpoints_owner_idx on public.cooking_checkpoints(user_id, created_at desc);
create index if not exists cooking_checkpoints_expiry_idx on public.cooking_checkpoints(expires_at);

create table if not exists public.realtime_attempts (
  id uuid primary key,
  session_id uuid not null references public.cooking_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('openai','gemini')),
  fallback_from text check (fallback_from in ('openai')),
  charged boolean not null default false,
  connected_at timestamptz,
  fallback_used boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(id, session_id, user_id)
);
create index if not exists realtime_attempts_expiry_idx on public.realtime_attempts(expires_at);

create or replace function public.claim_realtime_attempt(
  p_session_id uuid, p_attempt_id uuid, p_fallback_from text
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); v_attempt public.realtime_attempts%rowtype;
  v_count integer; v_limit integer := coalesce(nullif(current_setting('app.ai_daily_limit', true), '')::integer, 50);
begin
  if v_user is null then raise exception 'authentication required' using errcode='28000'; end if;
  if not exists(select 1 from public.cooking_sessions where id=p_session_id and user_id=v_user and status='in_progress') then
    raise exception 'active cooking session not found' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));
  select * into v_attempt from public.realtime_attempts where id=p_attempt_id for update;
  if found then
    if v_attempt.user_id <> v_user or v_attempt.session_id <> p_session_id or v_attempt.expires_at <= now() then
      raise exception 'attempt not found' using errcode='P0002'; end if;
    if p_fallback_from is distinct from 'openai' or v_attempt.provider <> 'openai' or v_attempt.fallback_used or v_attempt.connected_at is not null then
      raise exception 'fallback is unavailable' using errcode='22023'; end if;
    update public.realtime_attempts set provider='gemini', fallback_from='openai', fallback_used=true where id=p_attempt_id;
    return 'gemini';
  end if;
  if p_fallback_from is not null then raise exception 'fallback attempt not found' using errcode='P0002'; end if;
  insert into public.ai_usage_quota(user_id,date,count) values(v_user,current_date,0)
    on conflict(user_id) do update set date=current_date,
    count=case when ai_usage_quota.date=current_date then ai_usage_quota.count else 0 end;
  select count into v_count from public.ai_usage_quota where user_id=v_user for update;
  if v_count + 1 > v_limit then raise exception 'daily AI credit limit reached' using errcode='P0001'; end if;
  update public.ai_usage_quota set count=count+1,updated_at=now() where user_id=v_user;
  insert into public.realtime_attempts(id,session_id,user_id,provider,charged,expires_at)
    values(p_attempt_id,p_session_id,v_user,'openai',true,now()+interval '15 minutes');
  return 'openai';
end $$;

create or replace function public.mark_realtime_attempt_connected(p_session_id uuid,p_attempt_id uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.realtime_attempts set connected_at=coalesce(connected_at,now())
    where id=p_attempt_id and session_id=p_session_id and user_id=auth.uid() and expires_at>now()
      and exists(select 1 from public.cooking_sessions where id=p_session_id and user_id=auth.uid() and status='in_progress');
  return found;
end $$;
revoke execute on function public.claim_realtime_attempt(uuid,uuid,text),public.mark_realtime_attempt_connected(uuid,uuid) from public,anon;
grant execute on function public.claim_realtime_attempt(uuid,uuid,text),public.mark_realtime_attempt_connected(uuid,uuid) to authenticated;

alter table public.cooking_checkpoints enable row level security;
alter table public.realtime_attempts enable row level security;
create policy "cooking_checkpoints: read own" on public.cooking_checkpoints for select to authenticated using (auth.uid() = user_id);
create policy "realtime_attempts: read own" on public.realtime_attempts for select to authenticated using (auth.uid() = user_id);

alter table public.session_events add constraint session_events_payload_object
  check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 4096) not valid;

-- Browsers may read their own history but all state mutations use owner-checked
-- RPCs below. Service role remains available to workers and retention jobs.
revoke insert, update, delete on public.cooking_sessions, public.cooking_checkpoints,
  public.session_events, public.recipe_feedback from authenticated;
revoke all on public.realtime_attempts from authenticated;
grant select on public.cooking_sessions, public.cooking_checkpoints, public.session_events,
  public.recipe_feedback to authenticated;
grant select, insert, update, delete on public.cooking_checkpoints, public.realtime_attempts to service_role;

create or replace function public.update_cooking_session_timer(
  p_session_id uuid, p_timer jsonb, p_expected_version integer
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); v_session public.cooking_sessions%rowtype;
  v_status text; v_duration integer; v_step integer;
begin
  if v_user is null then raise exception 'authentication required' using errcode='28000'; end if;
  if jsonb_typeof(p_timer) <> 'object' or coalesce(p_timer->>'status','') not in ('idle','running','paused')
     or (p_timer ? 'stepIndex' and (p_timer->>'stepIndex') !~ '^[0-9]+$')
     or (p_timer ? 'durationSeconds' and (p_timer->>'durationSeconds') !~ '^[0-9]+$') then
    raise exception 'invalid timer' using errcode='22023'; end if;
  select * into v_session from public.cooking_sessions where id=p_session_id and user_id=v_user for update;
  if not found then raise exception 'session not found' using errcode='P0002'; end if;
  if v_session.version <> p_expected_version then return jsonb_build_object('conflict',true,'session',to_jsonb(v_session)); end if;
  if v_session.status <> 'in_progress' then raise exception 'session cannot be changed' using errcode='22023'; end if;
  v_status := p_timer->>'status';
  if v_status = 'idle' then
    if p_timer <> '{"status":"idle"}'::jsonb then raise exception 'invalid idle timer' using errcode='22023'; end if;
  else
    if (p_timer->>'stepIndex') !~ '^[0-9]{1,3}$' or (p_timer->>'durationSeconds') !~ '^[0-9]{1,5}$' then raise exception 'invalid timer fields' using errcode='22023'; end if;
    v_step := (p_timer->>'stepIndex')::integer; v_duration := (p_timer->>'durationSeconds')::integer;
    if v_step <> v_session.current_step or v_duration not between 1 and 86400 then raise exception 'timer does not match active step' using errcode='22023'; end if;
    if v_status = 'paused' then
      if (p_timer->>'pausedRemainingSeconds') !~ '^[0-9]{1,5}$' or (p_timer->>'pausedRemainingSeconds')::integer > v_duration or (p_timer - array['status','stepIndex','durationSeconds','pausedRemainingSeconds']) <> '{}'::jsonb then raise exception 'invalid paused timer' using errcode='22023'; end if;
    else
      if (p_timer - array['status','stepIndex','durationSeconds','startedAt','endsAt']) <> '{}'::jsonb
        or abs(extract(epoch from ((p_timer->>'startedAt')::timestamptz - now()))) > 300
        or abs(extract(epoch from ((p_timer->>'endsAt')::timestamptz - ((p_timer->>'startedAt')::timestamptz + make_interval(secs=>v_duration))))) > 2 then raise exception 'invalid running timer' using errcode='22023'; end if;
    end if;
  end if;
  update public.cooking_sessions set timer_state=p_timer, version=version+1, updated_at=now()
    where id=p_session_id returning * into v_session;
  return jsonb_build_object('conflict',false,'session',to_jsonb(v_session));
end $$;

create or replace function public.save_cooking_feedback(
  p_session_id uuid, p_rating integer, p_would_make_again boolean,
  p_perceived_difficulty integer, p_notes text
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); v_recipe uuid;
begin
  if v_user is null then raise exception 'authentication required' using errcode='28000'; end if;
  select recipe_id into v_recipe from public.cooking_sessions where id=p_session_id and user_id=v_user and status='completed';
  if not found then raise exception 'session not found' using errcode='P0002'; end if;
  if p_rating is not null and p_rating not between 1 and 5 or p_perceived_difficulty is not null and p_perceived_difficulty not between 1 and 5 or length(coalesce(p_notes,'')) > 2000 then
    raise exception 'invalid feedback' using errcode='22023'; end if;
  insert into public.recipe_feedback(user_id,session_id,recipe_id,rating,would_make_again,perceived_difficulty,notes)
    values(v_user,p_session_id,v_recipe,p_rating,p_would_make_again,p_perceived_difficulty,coalesce(p_notes,''))
    on conflict (user_id,session_id) do update set rating=excluded.rating, would_make_again=excluded.would_make_again, perceived_difficulty=excluded.perceived_difficulty, notes=excluded.notes;
  return true;
end $$;

create or replace function public.append_cooking_event(
  p_session_id uuid, p_step_index integer, p_kind text, p_payload jsonb, p_expires_at timestamptz default null
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'authentication required' using errcode='28000'; end if;
  if jsonb_typeof(p_payload) <> 'object' or pg_column_size(p_payload) > 4096 or p_kind not in ('session_started','step_entered','qa','photo_check','photo_upload','feedback') then raise exception 'invalid event' using errcode='22023'; end if;
  if not exists(select 1 from public.cooking_sessions where id=p_session_id and user_id=v_user and (p_step_index is null or p_step_index between 1 and jsonb_array_length(coalesce(recipe->'steps','[]'::jsonb)))) then raise exception 'session not found' using errcode='P0002'; end if;
  if p_expires_at is not null and (p_expires_at <= now() or p_expires_at > now()+interval '30 days') then raise exception 'invalid event expiry' using errcode='22023'; end if;
  insert into public.session_events(session_id,user_id,step_index,kind,payload,expires_at) values(p_session_id,v_user,p_step_index,p_kind,p_payload,coalesce(p_expires_at,now()+interval '30 days'));
  return true;
end $$;

create or replace function public.record_cooking_checkpoint(
  p_session_id uuid, p_step_index integer, p_object_path text, p_verdict jsonb
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); v_id uuid; v_steps integer;
begin
  if v_user is null then raise exception 'authentication required' using errcode='28000'; end if;
  select jsonb_array_length(coalesce(recipe->'steps','[]'::jsonb)) into v_steps from public.cooking_sessions where id=p_session_id and user_id=v_user and status='in_progress';
  if not found or p_step_index < 1 or p_step_index > v_steps or jsonb_typeof(p_verdict) <> 'object' or pg_column_size(p_verdict) > 3000
    or p_object_path !~ ('^' || v_user::text || '/checkpoints/' || p_session_id::text || '/[0-9a-f-]{36}[.](jpg|png|webp)$') then
    raise exception 'invalid checkpoint' using errcode='22023'; end if;
  insert into public.cooking_checkpoints(session_id,user_id,step_index,object_path,verdict) values(p_session_id,v_user,p_step_index,p_object_path,p_verdict) returning id into v_id;
  perform public.append_cooking_event(p_session_id,p_step_index,'photo_check',jsonb_build_object('checkpointId',v_id,'verdict',p_verdict));
  return v_id;
end $$;

-- Replace the older permissive adjustment RPC with validation against the
-- immutable snapshot. Progress/completion now also update the durable clock.
create or replace function public.append_cooking_adjustment(p_session_id uuid, p_adjustment jsonb, p_expected_version integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); v_session public.cooking_sessions%rowtype; v_step integer; v_steps integer;
begin
  if v_user is null then raise exception 'authentication required' using errcode='28000'; end if;
  if jsonb_typeof(p_adjustment) <> 'object' or (p_adjustment - array['stepIndex','title','detail']) <> '{}'::jsonb
    or coalesce(p_adjustment->>'stepIndex','') !~ '^[0-9]{1,3}$'
    or length(coalesce(p_adjustment->>'title','')) not between 1 and 120
    or length(coalesce(p_adjustment->>'detail','')) not between 1 and 1000 then
    raise exception 'invalid adjustment' using errcode='22023'; end if;
  select * into v_session from public.cooking_sessions where id=p_session_id and user_id=v_user for update;
  if not found then raise exception 'session not found' using errcode='P0002'; end if;
  if v_session.version <> p_expected_version then return jsonb_build_object('conflict',true,'session',to_jsonb(v_session)); end if;
  v_step := (p_adjustment->>'stepIndex')::integer; v_steps := jsonb_array_length(coalesce(v_session.recipe->'steps','[]'::jsonb));
  if v_session.status <> 'in_progress' or v_step <> v_session.current_step or v_step > v_steps then raise exception 'session cannot be adjusted' using errcode='22023'; end if;
  update public.cooking_sessions set adjustments=adjustments || jsonb_build_array(p_adjustment),version=version+1,updated_at=now() where id=p_session_id returning * into v_session;
  perform public.append_cooking_event(p_session_id,v_step,'qa',jsonb_build_object('adjustment',p_adjustment));
  return jsonb_build_object('conflict',false,'session',to_jsonb(v_session));
end $$;

create or replace function public.update_cooking_session_progress(p_session_id uuid, p_step integer, p_expected_version integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); v_session public.cooking_sessions%rowtype;
begin
  if v_user is null then raise exception 'authentication required' using errcode='28000'; end if;
  select * into v_session from public.cooking_sessions where id=p_session_id and user_id=v_user for update;
  if not found then raise exception 'session not found' using errcode='P0002'; end if;
  if v_session.version <> p_expected_version then return jsonb_build_object('conflict',true,'session',to_jsonb(v_session)); end if;
  if v_session.status <> 'in_progress' or p_step < 1 or p_step > jsonb_array_length(coalesce(v_session.recipe->'steps','[]'::jsonb)) then raise exception 'invalid session update' using errcode='22023'; end if;
  update public.cooking_sessions set current_step=p_step,version=version+1,updated_at=now() where id=p_session_id returning * into v_session;
  perform public.append_cooking_event(p_session_id,p_step,'step_entered','{}');
  return jsonb_build_object('conflict',false,'session',to_jsonb(v_session));
end $$;

create or replace function public.complete_cooking_session(p_session_id uuid, p_expected_version integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); v_session public.cooking_sessions%rowtype;
begin
  if v_user is null then raise exception 'authentication required' using errcode='28000'; end if;
  select * into v_session from public.cooking_sessions where id=p_session_id and user_id=v_user for update;
  if not found then raise exception 'session not found' using errcode='P0002'; end if;
  if v_session.status='completed' then return jsonb_build_object('conflict',false,'session',to_jsonb(v_session)); end if;
  if v_session.version <> p_expected_version then return jsonb_build_object('conflict',true,'session',to_jsonb(v_session)); end if;
  if v_session.status <> 'in_progress' then raise exception 'session cannot be completed' using errcode='22023'; end if;
  update public.cooking_sessions set status='completed',completed_at=now(),version=version+1,updated_at=now() where id=p_session_id returning * into v_session;
  return jsonb_build_object('conflict',false,'session',to_jsonb(v_session));
end $$;

revoke execute on function public.update_cooking_session_timer(uuid,jsonb,integer), public.save_cooking_feedback(uuid,integer,boolean,integer,text), public.append_cooking_event(uuid,integer,text,jsonb,timestamptz), public.record_cooking_checkpoint(uuid,integer,text,jsonb) from public, anon;
grant execute on function public.update_cooking_session_timer(uuid,jsonb,integer), public.save_cooking_feedback(uuid,integer,boolean,integer,text), public.append_cooking_event(uuid,integer,text,jsonb,timestamptz), public.record_cooking_checkpoint(uuid,integer,text,jsonb) to authenticated;
