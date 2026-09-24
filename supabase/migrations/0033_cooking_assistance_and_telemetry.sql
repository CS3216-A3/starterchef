-- Phase 5: only the trusted server can apply a confirmed cooking adjustment.
-- Keep the owner and version checks inside the transaction, even though the
-- route performs both before it calls this function.
revoke insert,update,delete on public.cooking_sessions,public.cooking_checkpoints,
  public.session_events,public.recipe_feedback,public.realtime_attempts
  from public,anon,authenticated;
drop policy if exists "cooking_sessions: own rows only" on public.cooking_sessions;
drop policy if exists "recipe_feedback: own rows only" on public.recipe_feedback;
drop policy if exists "cooking_sessions: read own" on public.cooking_sessions;
drop policy if exists "recipe_feedback: read own" on public.recipe_feedback;
create policy "cooking_sessions: read own" on public.cooking_sessions
  for select to authenticated using (auth.uid()=user_id);
create policy "recipe_feedback: read own" on public.recipe_feedback
  for select to authenticated using (auth.uid()=user_id);

create or replace function public.apply_cooking_adjustment_service(
  p_user_id uuid, p_session_id uuid, p_adjustment jsonb, p_expected_version integer
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_session public.cooking_sessions%rowtype;
  v_step integer;
  v_instruction text;
  v_diets text[];
  v_allergies text[];
  v_allergen text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if p_user_id is null or p_expected_version < 1 or jsonb_typeof(p_adjustment) <> 'object'
    or (p_adjustment - array['stepIndex','title','detail','replacementInstruction']) <> '{}'::jsonb
    or coalesce(p_adjustment->>'stepIndex','') !~ '^[0-9]{1,3}$'
    or length(btrim(coalesce(p_adjustment->>'title',''))) not between 1 and 120
    or length(btrim(coalesce(p_adjustment->>'detail',''))) not between 1 and 1000
    or length(btrim(coalesce(p_adjustment->>'replacementInstruction',''))) not between 1 and 1000 then
    raise exception 'invalid adjustment' using errcode='22023';
  end if;
  select * into v_session from public.cooking_sessions
    where id=p_session_id and user_id=p_user_id for update;
  if not found then raise exception 'session not found' using errcode='P0002'; end if;
  if v_session.version <> p_expected_version then
    return jsonb_build_object('conflict',true,'session',to_jsonb(v_session));
  end if;
  v_step := (p_adjustment->>'stepIndex')::integer;
  v_instruction := btrim(p_adjustment->>'replacementInstruction');
  if v_session.status <> 'in_progress' or v_step <> v_session.current_step
    or v_step > jsonb_array_length(coalesce(v_session.recipe->'steps','[]'::jsonb)) then
    raise exception 'session cannot be adjusted' using errcode='22023';
  end if;
  if v_instruction ~* '(eat raw (chicken|poultry)|undercook (chicken|poultry)|leave.{0,80}room temperature.{0,80}overnight|serve (chicken|poultry).{0,30}(raw|pink))' then
    raise exception 'unsafe adjustment' using errcode='22023';
  end if;
  select dietary_restrictions, allergies into v_diets, v_allergies
    from public.profiles where id=p_user_id;
  if not found then raise exception 'profile not found' using errcode='P0002'; end if;
  foreach v_allergen in array coalesce(v_allergies,'{}'::text[]) loop
    if length(btrim(v_allergen)) > 1 and position(lower(btrim(v_allergen)) in lower(v_instruction)) > 0 then
      raise exception 'allergy conflict' using errcode='22023';
    end if;
  end loop;
  if ('vegan' = any(v_diets) and v_instruction ~* '\m(chicken|beef|pork|fish|shrimp|milk|butter|cheese|egg|honey)\M')
    or ('vegetarian' = any(v_diets) and v_instruction ~* '\m(chicken|beef|pork|fish|shrimp)\M') then
    raise exception 'dietary conflict' using errcode='22023';
  end if;
  update public.cooking_sessions
    set recipe=jsonb_set(recipe,array['steps',(v_step-1)::text,'instruction'],to_jsonb(v_instruction),false),
        adjustments=adjustments || jsonb_build_array(p_adjustment),
        version=version+1, updated_at=now()
    where id=p_session_id and user_id=p_user_id returning * into v_session;
  insert into public.session_events(session_id,user_id,step_index,kind,payload)
    values(p_session_id,p_user_id,v_step,'qa',jsonb_build_object('adjustment',p_adjustment));
  return jsonb_build_object('conflict',false,'session',to_jsonb(v_session));
end $$;

-- Accepted recipes stay immutable to app clients. These two service-only
-- maintenance RPCs allow verified media relocation and expired-draft cleanup.
create or replace function public.prevent_accepted_recipe_mutation() returns trigger
language plpgsql as $$ begin
  if old.accepted_draft_id is not null
    and not (auth.role() = 'service_role' and coalesce(current_setting('app.media_maintenance',true),'') = 'on') then
    raise exception 'accepted recipes are immutable' using errcode='55000';
  end if;
  return new;
end $$;

create or replace function public.migrate_recipe_media_service(
  p_recipe_id uuid, p_image_url text, p_steps jsonb
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if jsonb_typeof(p_steps) <> 'array' then
    raise exception 'invalid steps' using errcode='22023';
  end if;
  perform set_config('app.media_maintenance','on',true);
  update public.recipes set image_url=p_image_url,steps=p_steps where id=p_recipe_id;
  return found;
end $$;

create or replace function public.purge_expired_recipe_draft_service(p_draft_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_draft public.recipe_drafts%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  select * into v_draft from public.recipe_drafts
    where id=p_draft_id and expires_at < now() for update;
  if not found then return false; end if;
  perform set_config('app.media_maintenance','on',true);
  update public.recipes set accepted_draft_id=null
    where accepted_draft_id=v_draft.id and user_id=v_draft.user_id;
  delete from public.recipe_drafts where id=v_draft.id;
  return true;
end $$;

revoke all on function public.migrate_recipe_media_service(uuid,text,jsonb),
  public.purge_expired_recipe_draft_service(uuid) from public,anon,authenticated;
grant execute on function public.migrate_recipe_media_service(uuid,text,jsonb),
  public.purge_expired_recipe_draft_service(uuid) to service_role;

-- Catalogue media remains intentionally public after user media is moved.
insert into storage.buckets (id,name,public)
  values ('recipe-catalogue','recipe-catalogue',true)
  on conflict (id) do update set public=true;
drop policy if exists "recipe-catalogue: public read" on storage.objects;
create policy "recipe-catalogue: public read" on storage.objects
  for select using (bucket_id='recipe-catalogue');

revoke all on function public.apply_cooking_adjustment_service(uuid,uuid,jsonb,integer)
  from public, anon, authenticated;
grant execute on function public.apply_cooking_adjustment_service(uuid,uuid,jsonb,integer)
  to service_role;

-- Metadata only. No prompt, response, media, transcript, SDP, or credential
-- columns are allowed in this table.
alter table public.ai_calls add column if not exists route text;
alter table public.ai_calls add column if not exists stage text;
alter table public.ai_calls add column if not exists prompt_template_version text;
alter table public.ai_calls add column if not exists capability text;
alter table public.ai_calls add column if not exists modality text;
alter table public.ai_calls add column if not exists outcome text;
alter table public.ai_calls add column if not exists error_code text;
alter table public.ai_calls add column if not exists draft_id uuid;
alter table public.ai_calls add column if not exists session_id uuid;
alter table public.ai_calls add column if not exists voice_attempt_id uuid;
create unique index if not exists recipe_drafts_user_id_id_key on public.recipe_drafts(user_id,id);
create unique index if not exists cooking_sessions_user_id_id_key on public.cooking_sessions(user_id,id);
create unique index if not exists realtime_attempts_user_id_id_key on public.realtime_attempts(user_id,id);
do $$ begin
  if not exists (select 1 from pg_constraint where conname='ai_calls_draft_owner_fk') then
    alter table public.ai_calls add constraint ai_calls_draft_owner_fk
      foreign key (user_id,draft_id) references public.recipe_drafts(user_id,id) on delete set null (draft_id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='ai_calls_session_owner_fk') then
    alter table public.ai_calls add constraint ai_calls_session_owner_fk
      foreign key (user_id,session_id) references public.cooking_sessions(user_id,id) on delete set null (session_id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='ai_calls_voice_owner_fk') then
    alter table public.ai_calls add constraint ai_calls_voice_owner_fk
      foreign key (user_id,voice_attempt_id) references public.realtime_attempts(user_id,id) on delete set null (voice_attempt_id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='ai_calls_safe_metadata') then
    alter table public.ai_calls add constraint ai_calls_safe_metadata
      check (
        length(coalesce(route,'')) <= 100 and length(coalesce(stage,'')) <= 80 and
        length(coalesce(prompt_template_version,'')) <= 40 and length(coalesce(capability,'')) <= 40 and
        length(coalesce(modality,'')) <= 20 and length(coalesce(error_code,'')) <= 40 and
        (outcome is null or outcome in ('success','failure','connected','closed')) and
        (draft_id is null and session_id is null and voice_attempt_id is null or user_id is not null)
      ) not valid;
  end if;
end $$;
