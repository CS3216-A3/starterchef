-- Phase 3 operational hardening. Keep recipe routing policy in application
-- configuration; this migration only makes the durable draft lifecycle safe.

alter table public.recipe_drafts
  add column if not exists workflow_attempt_id uuid not null default gen_random_uuid();

-- A user may have one recipe review in flight. Terminal drafts remain
-- available for audit and do not prevent a new request.
with ranked as (
  select id, row_number() over (partition by user_id order by created_at desc, id desc) as n
  from public.recipe_drafts
  where status in ('queued', 'acquiring_source', 'extracting_or_generating',
                   'verifying', 'adjudicating', 'awaiting_user_acceptance')
)
update public.recipe_drafts d
set status = 'failed_retryable', failure_code = 'DUPLICATE_ACTIVE_RECONCILED',
    workflow_attempt_id = gen_random_uuid(), updated_at = now()
from ranked r where d.id = r.id and r.n > 1;

create unique index if not exists recipe_drafts_one_active_per_user
  on public.recipe_drafts (user_id)
  where status in ('queued', 'acquiring_source', 'extracting_or_generating',
                   'verifying', 'adjudicating', 'awaiting_user_acceptance');

-- Creation, private-input claiming and the maximum workflow reservation are
-- deliberately one transaction. The application never separately increments
-- quota for generation/revision stages of a draft.
create or replace function public.create_recipe_draft(
  p_kind text,
  p_request jsonb,
  p_input_id uuid,
  p_idempotency_key uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_draft public.recipe_drafts%rowtype;
  v_input public.recipe_inputs%rowtype;
  v_limit integer := coalesce(nullif(current_setting('app.ai_daily_limit', true), '')::integer, 50);
  v_total integer;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_idempotency_key is null then raise exception 'idempotency key required' using errcode = '22023'; end if;
  if p_kind not in ('generated', 'photo', 'youtube', 'adapted', 'text', 'url')
     or p_request is null or jsonb_typeof(p_request) <> 'object' or pg_column_size(p_request) > 24000 then
    raise exception 'invalid draft request' using errcode = '22023';
  end if;
  if p_kind = 'adapted' and not exists(
    select 1 from public.recipes where id = (p_request->>'recipeId')::uuid and (user_id is null or user_id = v_user)
  ) then raise exception 'recipe not found' using errcode='P0002'; end if;
  if p_kind = 'youtube' and coalesce(p_request->>'url','') !~* '^https?://(www[.])?(m[.])?(youtube[.]com|youtu[.]be)(/|$)' then
    raise exception 'YouTube host required' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtext(v_user::text));
  select * into v_draft from public.recipe_drafts
    where user_id = v_user and idempotency_key = p_idempotency_key for update;
  if found then return jsonb_build_object('draft', to_jsonb(v_draft), 'created', false); end if;

  if exists (select 1 from public.recipe_drafts where user_id = v_user and status in
      ('queued', 'acquiring_source', 'extracting_or_generating', 'verifying', 'adjudicating', 'awaiting_user_acceptance')) then
    raise exception 'an active recipe draft already exists' using errcode = '23505';
  end if;

  if p_kind = 'photo' then
    select * into v_input from public.recipe_inputs where id = p_input_id and user_id = v_user for update;
    if not found or v_input.consuming_draft_id is not null then
      raise exception 'recipe input not found or already claimed' using errcode = 'P0002';
    end if;
  elsif p_input_id is not null then
    raise exception 'only photo drafts may have an input' using errcode = '22023';
  end if;

  insert into public.ai_usage_quota (user_id, date, count)
    values (v_user, current_date, 0)
    on conflict (user_id) do update set
      date = current_date,
      count = case when ai_usage_quota.date = current_date then ai_usage_quota.count else 0 end;
  select count into v_total from public.ai_usage_quota
    where user_id = v_user for update;
  if v_total + 6 > v_limit then
    raise exception 'daily AI credit limit reached' using errcode = 'P0001';
  end if;
  update public.ai_usage_quota set count = count + 6, updated_at = now()
    where user_id = v_user;

  insert into public.recipe_drafts (
    user_id, kind, request, input_id, input_sha256, idempotency_key,
    quota_units, status
  ) values (
    v_user, p_kind, p_request, p_input_id,
    case when p_kind = 'photo' then v_input.sha256 else null end,
    p_idempotency_key, 6, 'queued'
  ) returning * into v_draft;
  if p_kind = 'photo' then
    update public.recipe_inputs set consuming_draft_id = v_draft.id where id = v_input.id;
  end if;
  return jsonb_build_object('draft', to_jsonb(v_draft), 'created', true);
end $$;

revoke execute on function public.create_recipe_draft(text,jsonb,uuid,uuid) from public, anon;
grant execute on function public.create_recipe_draft(text,jsonb,uuid,uuid) to authenticated;

-- Only a worker carrying the current opaque attempt may change workflow state.
-- A new restart receives a new attempt id, making a late Vercel run harmless.
create or replace function public.update_recipe_draft_workflow(
  p_draft_id uuid,
  p_attempt_id uuid,
  p_status text,
  p_failure_code text default null,
  p_canonical_recipe jsonb default null,
  p_verification jsonb default null,
  p_retry_count integer default null
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.role() <> 'service_role' then raise exception 'worker access required' using errcode = '42501'; end if;
  if p_status not in ('queued','acquiring_source','extracting_or_generating','verifying','adjudicating','awaiting_user_acceptance','blocked','failed_retryable','failed_permanent') then
    raise exception 'invalid workflow status' using errcode = '22023';
  end if;
  update public.recipe_drafts set
    status = p_status, failure_code = p_failure_code,
    canonical_recipe = coalesce(p_canonical_recipe, canonical_recipe),
    verification = coalesce(p_verification, verification),
    retry_count = coalesce(p_retry_count, retry_count), updated_at = now()
  where id = p_draft_id and workflow_attempt_id = p_attempt_id;
  return found;
end $$;
revoke execute on function public.update_recipe_draft_workflow(uuid,uuid,text,text,jsonb,jsonb,integer) from public, anon, authenticated;
grant execute on function public.update_recipe_draft_workflow(uuid,uuid,text,text,jsonb,jsonb,integer) to service_role;

create or replace function public.reject_recipe_draft(p_draft_id uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'authentication required' using errcode = '28000'; end if;
  update public.recipe_drafts set status = 'rejected', workflow_attempt_id = gen_random_uuid(), updated_at = now()
    where id = p_draft_id and user_id = v_user and status not in ('accepted','rejected');
  if found then return true; end if;
  if exists (select 1 from public.recipe_drafts where id = p_draft_id and user_id = v_user and status = 'rejected') then return true; end if;
  raise exception 'draft not found or cannot be rejected' using errcode = 'P0002';
end $$;
revoke execute on function public.reject_recipe_draft(uuid) from public, anon;
grant execute on function public.reject_recipe_draft(uuid) to authenticated;

-- Tighten promotion without rewriting 0023. The original function remains
-- revoked; the replacement also preserves the adaptation's parent link.
alter function public.accept_recipe_draft(uuid) rename to accept_recipe_draft_legacy;
revoke execute on function public.accept_recipe_draft_legacy(uuid) from public, anon, authenticated;
create function public.accept_recipe_draft(draft_id uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); v_draft public.recipe_drafts%rowtype;
  v_final jsonb; v_initial jsonb; v_recipe uuid; v_parent uuid;
  v_title text; v_slug text; v_n integer := 2;
begin
  if v_user is null then raise exception 'authentication required' using errcode='28000'; end if;
  select * into v_draft from public.recipe_drafts where id=draft_id and user_id=v_user for update;
  if not found then raise exception 'draft not found' using errcode='P0002'; end if;
  if v_draft.accepted_recipe_id is not null then return v_draft.accepted_recipe_id; end if;
  v_final := coalesce(v_draft.verification->'verification_final',v_draft.verification->'gemini_final');
  v_initial := v_draft.verification->'verification_initial';
  if v_draft.status <> 'awaiting_user_acceptance' or coalesce(v_draft.verification->>'verdict','') <> 'pass'
    or coalesce(v_final->>'verdict','') <> 'pass'
    or coalesce(v_initial->>'verdict','') not in ('pass','revise')
    or v_draft.canonical_recipe is null or v_draft.retry_count > 1 then
    raise exception 'draft has not passed final verification' using errcode='22023';
  end if;
  if v_draft.kind = 'adapted' then
    select id into v_parent from public.recipes
      where id = (v_draft.request->>'recipeId')::uuid and (user_id is null or user_id = v_user);
    if not found then raise exception 'adaptation source recipe not found' using errcode='P0002'; end if;
  end if;
  v_title := left(coalesce(nullif(btrim(v_draft.canonical_recipe->>'title'), ''), 'Untitled recipe'), 120);
  v_slug := trim(both '-' from lower(regexp_replace(v_title, '[^a-z0-9]+', '-', 'g')));
  if v_slug = '' then v_slug := 'recipe'; end if;
  perform pg_advisory_xact_lock(hashtext(v_slug));
  while exists(select 1 from public.recipes where slug = v_slug) loop
    v_slug := left(trim(both '-' from lower(regexp_replace(v_title, '[^a-z0-9]+', '-', 'g'))), 100) || '-' || v_n;
    v_n := v_n + 1;
  end loop;
  insert into public.recipes(slug,title,description,minutes,difficulty,servings,why_good,icon,image_tint,ingredients,equipment,steps,tags,source,user_id,parent_recipe_id,is_personalized,accepted_draft_id)
  values (v_slug, v_title, coalesce(v_draft.canonical_recipe->>'description',''), greatest(1,coalesce((v_draft.canonical_recipe->>'minutes')::int,1)), coalesce(v_draft.canonical_recipe->>'difficulty','easy'), greatest(1,coalesce((v_draft.canonical_recipe->>'servings')::int,1)), coalesce(v_draft.canonical_recipe->>'whyGood',''), 'cooking-pot','from-oat to-oat-dark', coalesce(array(select jsonb_array_elements_text(v_draft.canonical_recipe->'ingredients')), '{}'), coalesce(array(select jsonb_array_elements_text(v_draft.canonical_recipe->'equipment')), '{}'), coalesce(v_draft.canonical_recipe->'steps','[]'::jsonb), coalesce(array(select jsonb_array_elements_text(v_draft.canonical_recipe->'tags')), '{}'), 'verified-draft', v_user, v_parent, v_draft.kind = 'adapted', v_draft.id)
  returning id into v_recipe;
  update public.recipe_drafts set accepted_recipe_id = v_recipe, status = 'accepted', updated_at = now(), expires_at = now() + interval '30 days' where id = v_draft.id;
  return v_recipe;
end $$;
revoke execute on function public.accept_recipe_draft(uuid) from public, anon;
grant execute on function public.accept_recipe_draft(uuid) to authenticated;
