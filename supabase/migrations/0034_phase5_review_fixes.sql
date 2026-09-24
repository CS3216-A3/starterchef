-- 0033 is already applied on the linked project. Keep these corrections
-- additive so both existing and fresh installations receive them.
create or replace function public.unsafe_perishable_storage(p_instruction text)
returns boolean language sql immutable strict set search_path = public, pg_temp as $$
  select p_instruction ~* '(leave|keep|store|rest|hold).{0,80}(raw[[:space:]]+)?(chicken|poultry|meat|fish|seafood|milk|dairy|eggs?|perishables?|leftovers|cooked food).{0,80}(counter|room temperature|out).{0,60}([3-9]|[1-9][0-9]|2\.[1-9][0-9]*|three|four|five|six|seven|eight|nine|ten|two and (a )?half|(over|more than|longer than) (two|2))[[:space:]]*(hours?|hrs?)';
$$;

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
  if v_instruction ~* '(eat raw (chicken|poultry)|undercook (chicken|poultry)|leave.{0,80}room temperature.{0,80}overnight|serve (chicken|poultry).{0,30}(raw|pink))'
    or public.unsafe_perishable_storage(v_instruction) then
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

-- BEFORE DELETE has no NEW row. Returning NULL would silently cancel deletes.
create or replace function public.prevent_accepted_recipe_mutation() returns trigger
language plpgsql as $$ begin
  if old.accepted_draft_id is not null
    and not (auth.role() = 'service_role' and coalesce(current_setting('app.media_maintenance',true),'') = 'on') then
    raise exception 'accepted recipes are immutable' using errcode='55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
