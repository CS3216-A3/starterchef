-- A confirmed cooking suggestion edits only the owned session snapshot.
-- The saved source recipe remains unchanged; lasting AI edits still require a
-- separately verified adaptation draft.
create or replace function public.append_cooking_adjustment(
  p_session_id uuid, p_adjustment jsonb, p_expected_version integer
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_session public.cooking_sessions%rowtype;
  v_step integer;
  v_instruction text;
  v_recipe jsonb;
  v_restriction text;
begin
  if v_user is null then raise exception 'authentication required' using errcode='28000'; end if;
  if jsonb_typeof(p_adjustment) <> 'object'
    or (p_adjustment - array['stepIndex','title','detail','replacementInstruction']) <> '{}'::jsonb
    or coalesce(p_adjustment->>'stepIndex','') !~ '^[0-9]{1,3}$'
    or length(btrim(coalesce(p_adjustment->>'title',''))) not between 1 and 120
    or length(btrim(coalesce(p_adjustment->>'detail',''))) not between 1 and 1000
    or length(btrim(coalesce(p_adjustment->>'replacementInstruction',''))) not between 1 and 1000 then
    raise exception 'invalid adjustment' using errcode='22023';
  end if;
  v_step := (p_adjustment->>'stepIndex')::integer;
  v_instruction := btrim(p_adjustment->>'replacementInstruction');
  if v_instruction ~* '(eat raw chicken|undercook poultry|leave.{0,80}room temperature.{0,80}overnight)' then
    raise exception 'unsafe adjustment' using errcode='22023';
  end if;
  for v_restriction in
    select lower(btrim(value)) from public.profiles p,
      lateral unnest(coalesce(p.allergies,'{}'::text[]) || coalesce(p.dietary_restrictions,'{}'::text[])) value
    where p.id = v_user and length(btrim(value)) > 2
  loop
    if position(v_restriction in lower(v_instruction)) > 0 then
      raise exception 'adjustment conflicts with dietary profile' using errcode='22023';
    end if;
  end loop;
  select * into v_session from public.cooking_sessions
    where id=p_session_id and user_id=v_user for update;
  if not found then raise exception 'session not found' using errcode='P0002'; end if;
  if v_session.version <> p_expected_version then
    return jsonb_build_object('conflict',true,'session',to_jsonb(v_session));
  end if;
  if v_session.status <> 'in_progress' or v_step <> v_session.current_step
    or v_step < 1 or v_step > jsonb_array_length(coalesce(v_session.recipe->'steps','[]'::jsonb)) then
    raise exception 'session cannot be adjusted' using errcode='22023';
  end if;
  v_recipe := jsonb_set(v_session.recipe,
    array['steps',(v_step-1)::text,'instruction'], to_jsonb(v_instruction), false);
  update public.cooking_sessions
    set recipe=v_recipe, adjustments=adjustments || jsonb_build_array(p_adjustment),
        version=version+1, updated_at=now()
    where id=p_session_id returning * into v_session;
  perform public.append_cooking_event(p_session_id,v_step,'qa',
    jsonb_build_object('adjustment',p_adjustment));
  return jsonb_build_object('conflict',false,'session',to_jsonb(v_session));
end $$;

-- Tailoring a generated candidate is another paid generation + verification
-- attempt on the same owned draft, so it cannot bypass one-active-draft or
-- final-verifier acceptance rules.
alter table public.recipe_drafts
  add column if not exists tailoring_source jsonb,
  add column if not exists tailoring_intent text,
  add column if not exists tailoring_count integer not null default 0
    check (tailoring_count between 0 and 2),
  add column if not exists tailoring_idempotency_key uuid;

create or replace function public.tailor_recipe_draft(
  p_draft_id uuid, p_intent text, p_idempotency_key uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_draft public.recipe_drafts%rowtype;
  v_limit integer := coalesce(nullif(current_setting('app.ai_daily_limit', true), '')::integer, 50);
  v_total integer;
begin
  if v_user is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_idempotency_key is null or length(btrim(coalesce(p_intent,''))) not between 1 and 1000 then
    raise exception 'invalid tailoring request' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));
  select * into v_draft from public.recipe_drafts
    where id=p_draft_id and user_id=v_user for update;
  if not found then raise exception 'draft not found' using errcode='P0002'; end if;
  if v_draft.tailoring_idempotency_key = p_idempotency_key then
    return jsonb_build_object('draft',to_jsonb(v_draft),'created',false);
  end if;
  if v_draft.status <> 'awaiting_user_acceptance' or v_draft.canonical_recipe is null
    or coalesce(v_draft.verification->>'verdict','') <> 'pass'
    or v_draft.tailoring_count >= 2 then
    raise exception 'draft cannot be tailored' using errcode='22023';
  end if;
  insert into public.ai_usage_quota(user_id,date,count) values(v_user,current_date,0)
    on conflict (user_id) do update set date=current_date,
      count=case when ai_usage_quota.date=current_date then ai_usage_quota.count else 0 end;
  select count into v_total from public.ai_usage_quota where user_id=v_user for update;
  if v_total + 6 > v_limit then
    raise exception 'daily AI credit limit reached' using errcode='P0001';
  end if;
  update public.ai_usage_quota set count=count+6,updated_at=now() where user_id=v_user;
  update public.recipe_drafts set
    tailoring_source=canonical_recipe, tailoring_intent=btrim(p_intent),
    tailoring_count=tailoring_count+1, tailoring_idempotency_key=p_idempotency_key,
    canonical_recipe=null,
    verification=jsonb_build_object(
      'sourceAssessment',verification->'sourceAssessment',
      'assumptions',verification->'assumptions'),
    retry_count=0,
    status='queued',failure_code=null,workflow_attempt_id=gen_random_uuid(),
    workflow_run_id=null,quota_units=quota_units+6,updated_at=now()
    where id=p_draft_id returning * into v_draft;
  return jsonb_build_object('draft',to_jsonb(v_draft),'created',true);
end $$;
revoke execute on function public.tailor_recipe_draft(uuid,text,uuid) from public, anon;
grant execute on function public.tailor_recipe_draft(uuid,text,uuid) to authenticated;
