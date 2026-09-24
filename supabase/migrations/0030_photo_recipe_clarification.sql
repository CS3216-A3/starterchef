-- Photo clarification remains the same private, charged draft. Existing
-- migrations are immutable; this extends their status and quota policy.
alter table public.recipe_drafts drop constraint if exists recipe_drafts_status_check;
alter table public.recipe_drafts add constraint recipe_drafts_status_check check (
  status in ('queued','acquiring_source','extracting_or_generating','verifying',
             'adjudicating','awaiting_user_input','awaiting_user_acceptance',
             'accepted','rejected','failed_retryable','failed_permanent','blocked')
);
alter table public.recipe_drafts
  add column if not exists clarification_expires_at timestamptz;

drop index if exists public.recipe_drafts_one_active_per_user;
create unique index recipe_drafts_one_active_per_user on public.recipe_drafts(user_id)
  where status in ('queued','acquiring_source','extracting_or_generating',
                   'verifying','adjudicating','awaiting_user_input',
                   'awaiting_user_acceptance');

create or replace function public.create_recipe_draft(
  p_kind text, p_request jsonb, p_input_id uuid, p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_draft public.recipe_drafts%rowtype;
  v_input public.recipe_inputs%rowtype;
  v_limit integer := coalesce(nullif(current_setting('app.ai_daily_limit', true), '')::integer, 50);
  v_total integer;
  v_cost integer := case when p_kind = 'photo' then 7 else 6 end;
begin
  if v_user is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_idempotency_key is null then raise exception 'idempotency key required' using errcode='22023'; end if;
  if p_kind not in ('generated','photo','youtube','adapted','text','url')
     or p_request is null or jsonb_typeof(p_request) <> 'object' or pg_column_size(p_request) > 24000 then
    raise exception 'invalid draft request' using errcode='22023';
  end if;
  if p_kind = 'adapted' and not exists(
    select 1 from public.recipes where id=(p_request->>'recipeId')::uuid and (user_id is null or user_id=v_user)
  ) then raise exception 'recipe not found' using errcode='P0002'; end if;
  if p_kind = 'youtube' and coalesce(p_request->>'url','') !~* '^https?://(www[.])?(m[.])?(youtube[.]com|youtu[.]be)(/|$)' then
    raise exception 'YouTube host required' using errcode='22023'; end if;
  if p_kind = 'photo' and (p_request - 'dishHint') <> '{}'::jsonb then
    raise exception 'invalid photo request' using errcode='22023'; end if;
  if p_kind = 'photo' and p_request ? 'dishHint' and
     (jsonb_typeof(p_request->'dishHint') <> 'string' or length(btrim(p_request->>'dishHint')) > 120) then
    raise exception 'invalid dish hint' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtext(v_user::text));
  select * into v_draft from public.recipe_drafts
    where user_id=v_user and idempotency_key=p_idempotency_key for update;
  if found then return jsonb_build_object('draft',to_jsonb(v_draft),'created',false); end if;

  -- Cron is daily; a timed-out clarification must not hold the active slot.
  update public.recipe_drafts set status='blocked', failure_code='PHOTO_CLARIFICATION_EXPIRED',
    workflow_attempt_id=gen_random_uuid(), updated_at=now()
    where user_id=v_user and status='awaiting_user_input' and clarification_expires_at <= now();
  if exists (select 1 from public.recipe_drafts where user_id=v_user and status in
      ('queued','acquiring_source','extracting_or_generating','verifying',
       'adjudicating','awaiting_user_input','awaiting_user_acceptance')) then
    raise exception 'an active recipe draft already exists' using errcode='23505';
  end if;

  if p_kind='photo' then
    select * into v_input from public.recipe_inputs
      where id=p_input_id and user_id=v_user for update;
    if not found or v_input.consuming_draft_id is not null or v_input.expires_at <= now() then
      raise exception 'recipe input not found, expired, or already claimed' using errcode='P0002'; end if;
  elsif p_input_id is not null then
    raise exception 'only photo drafts may have an input' using errcode='22023'; end if;

  insert into public.ai_usage_quota(user_id,date,count) values(v_user,current_date,0)
    on conflict(user_id) do update set date=current_date,
      count=case when ai_usage_quota.date=current_date then ai_usage_quota.count else 0 end;
  select count into v_total from public.ai_usage_quota where user_id=v_user for update;
  if v_total+v_cost > v_limit then raise exception 'daily AI credit limit reached' using errcode='P0001'; end if;
  update public.ai_usage_quota set count=count+v_cost,updated_at=now() where user_id=v_user;

  insert into public.recipe_drafts(user_id,kind,request,input_id,input_sha256,
    idempotency_key,quota_units,status)
  values(v_user,p_kind,p_request,p_input_id,
    case when p_kind='photo' then v_input.sha256 else null end,
    p_idempotency_key,v_cost,'queued') returning * into v_draft;
  if p_kind='photo' then
    update public.recipe_inputs set consuming_draft_id=v_draft.id where id=v_input.id;
  end if;
  return jsonb_build_object('draft',to_jsonb(v_draft),'created',true);
end $$;
revoke execute on function public.create_recipe_draft(text,jsonb,uuid,uuid) from public,anon;
grant execute on function public.create_recipe_draft(text,jsonb,uuid,uuid) to authenticated;

-- The answer cannot alter the image, profile, source type, or canonical recipe.
-- A new attempt ID invalidates late work from the paused run.
create or replace function public.clarify_recipe_draft(p_draft_id uuid,p_answer text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_draft public.recipe_drafts%rowtype;
  v_attempt uuid := gen_random_uuid();
  v_answer text := btrim(p_answer);
begin
  if v_user is null then raise exception 'authentication required' using errcode='28000'; end if;
  if v_answer is null or length(v_answer) < 1 or length(v_answer) > 2000 then
    raise exception 'invalid clarification' using errcode='22023'; end if;
  select * into v_draft from public.recipe_drafts where id=p_draft_id and user_id=v_user for update;
  if not found then raise exception 'draft not found' using errcode='P0002'; end if;
  if v_draft.kind <> 'photo' or v_draft.status <> 'awaiting_user_input'
     or v_draft.clarification_expires_at <= now()
     or v_draft.request ? 'photoClarification'
     or not exists(select 1 from public.recipe_inputs
                   where id=v_draft.input_id and user_id=v_user and expires_at > now()) then
    raise exception 'clarification is no longer available' using errcode='22023'; end if;
  update public.recipe_drafts set request=jsonb_set(request,'{photoClarification}',to_jsonb(v_answer)),
    status='queued', failure_code=null, workflow_attempt_id=v_attempt, updated_at=now()
    where id=p_draft_id;
  return jsonb_build_object('draftId',p_draft_id,'attemptId',v_attempt);
end $$;
revoke execute on function public.clarify_recipe_draft(uuid,text) from public,anon;
grant execute on function public.clarify_recipe_draft(uuid,text) to authenticated;
