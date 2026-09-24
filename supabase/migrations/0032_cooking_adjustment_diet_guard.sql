-- Narrow the 0031 profile guard. A restriction label such as "vegetarian"
-- appearing in an instruction is not itself a dietary conflict.
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
  v_allergen text;
  v_diets text[];
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
  select dietary_restrictions into v_diets from public.profiles where id=v_user;
  for v_allergen in
    select lower(btrim(a.value)) from public.profiles p,
      lateral unnest(coalesce(p.allergies,'{}'::text[])) as a(value)
    where p.id=v_user and length(btrim(a.value)) > 2
  loop
    if lower(v_instruction) ~ ('\m' || regexp_replace(v_allergen,'[^a-z0-9 ]','','g') || '\M') then
      raise exception 'adjustment conflicts with allergy' using errcode='22023';
    end if;
  end loop;
  if ('vegan' = any(v_diets) and v_instruction ~* '\m(chicken|beef|pork|fish|shrimp|milk|butter|cheese|egg|honey)\M')
    or ('vegetarian' = any(v_diets) and v_instruction ~* '\m(chicken|beef|pork|fish|shrimp)\M') then
    raise exception 'adjustment conflicts with dietary profile' using errcode='22023';
  end if;
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
    array['steps',(v_step-1)::text,'instruction'],to_jsonb(v_instruction),false);
  update public.cooking_sessions
    set recipe=v_recipe,adjustments=adjustments || jsonb_build_array(p_adjustment),
        version=version+1,updated_at=now()
    where id=p_session_id returning * into v_session;
  perform public.append_cooking_event(p_session_id,v_step,'qa',
    jsonb_build_object('adjustment',p_adjustment));
  return jsonb_build_object('conflict',false,'session',to_jsonb(v_session));
end $$;
