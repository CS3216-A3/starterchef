alter table public.cooking_sessions add column if not exists version integer not null default 1 check (version > 0);
alter table public.cooking_sessions add column if not exists adjustments jsonb not null default '[]'::jsonb;
alter table public.cooking_sessions add column if not exists checkpoint_metadata jsonb not null default '[]'::jsonb;
alter table public.cooking_sessions add column if not exists expires_at timestamptz not null default now() + interval '30 days';
create unique index if not exists cooking_sessions_one_active_per_user on public.cooking_sessions(user_id) where status = 'in_progress';
alter table public.session_events add column if not exists expires_at timestamptz not null default now() + interval '30 days';
alter table public.recipe_feedback add column if not exists perceived_difficulty integer check (perceived_difficulty between 1 and 5);
alter table public.recipe_feedback add column if not exists would_make_again boolean;
create unique index if not exists recipe_feedback_one_per_session on public.recipe_feedback(user_id, session_id);

create or replace function public.start_cooking_session(p_recipe_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); v_recipe public.recipes%rowtype; v_session public.cooking_sessions%rowtype;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));
  select * into v_recipe from public.recipes where id = p_recipe_id and (user_id is null or user_id = v_user);
  if not found then raise exception 'recipe not found' using errcode = 'P0002'; end if;
  select * into v_session from public.cooking_sessions where user_id = v_user and status = 'in_progress' and recipe_id = p_recipe_id for update;
  if found then return to_jsonb(v_session); end if;
  update public.cooking_sessions set status = 'abandoned', completed_at = now(), version = version + 1 where user_id = v_user and status = 'in_progress';
  insert into public.cooking_sessions(user_id,recipe_id,recipe,current_step,status,version) values (v_user,v_recipe.id,jsonb_build_object('id',v_recipe.id,'slug',v_recipe.slug,'title',v_recipe.title,'description',v_recipe.description,'minutes',v_recipe.minutes,'servings',v_recipe.servings,'ingredients',v_recipe.ingredients,'equipment',v_recipe.equipment,'steps',v_recipe.steps),1,'in_progress',1) returning * into v_session;
  insert into public.session_events(session_id,user_id,kind,payload) values(v_session.id,v_user,'session_started',jsonb_build_object('recipeTitle',v_recipe.title));
  return to_jsonb(v_session);
end $$;

create or replace function public.update_cooking_session_progress(p_session_id uuid, p_step integer, p_expected_version integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); v_session public.cooking_sessions%rowtype;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into v_session from public.cooking_sessions where id=p_session_id and user_id=v_user for update;
  if not found then raise exception 'session not found' using errcode='P0002'; end if;
  if v_session.version <> p_expected_version then return jsonb_build_object('conflict',true,'session',to_jsonb(v_session)); end if;
  if v_session.status <> 'in_progress' or p_step < 1 or p_step > jsonb_array_length(coalesce(v_session.recipe->'steps','[]'::jsonb)) then raise exception 'invalid session update' using errcode='22023'; end if;
  update public.cooking_sessions set current_step=p_step,version=version+1 where id=p_session_id returning * into v_session;
  insert into public.session_events(session_id,user_id,step_index,kind,payload) values(p_session_id,v_user,p_step,'step_entered','{}');
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
  update public.cooking_sessions set status='completed',completed_at=now(),version=version+1 where id=p_session_id returning * into v_session;
  return jsonb_build_object('conflict',false,'session',to_jsonb(v_session));
end $$;

create or replace function public.append_cooking_adjustment(p_session_id uuid, p_adjustment jsonb, p_expected_version integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); v_session public.cooking_sessions%rowtype;
begin
  if v_user is null then raise exception 'authentication required' using errcode='28000'; end if;
  select * into v_session from public.cooking_sessions where id=p_session_id and user_id=v_user for update;
  if not found then raise exception 'session not found' using errcode='P0002'; end if;
  if v_session.version <> p_expected_version then return jsonb_build_object('conflict',true,'session',to_jsonb(v_session)); end if;
  if v_session.status <> 'in_progress' then raise exception 'session cannot be adjusted' using errcode='22023'; end if;
  update public.cooking_sessions set adjustments=adjustments || jsonb_build_array(p_adjustment), version=version+1 where id=p_session_id returning * into v_session;
  insert into public.session_events(session_id,user_id,step_index,kind,payload) values(p_session_id,v_user,v_session.current_step,'qa',jsonb_build_object('adjustment',p_adjustment));
  return jsonb_build_object('conflict',false,'session',to_jsonb(v_session));
end $$;
revoke execute on function public.start_cooking_session(uuid), public.update_cooking_session_progress(uuid,integer,integer), public.complete_cooking_session(uuid,integer), public.append_cooking_adjustment(uuid,jsonb,integer) from public, anon;
grant execute on function public.start_cooking_session(uuid), public.update_cooking_session_progress(uuid,integer,integer), public.complete_cooking_session(uuid,integer), public.append_cooking_adjustment(uuid,jsonb,integer) to authenticated;
