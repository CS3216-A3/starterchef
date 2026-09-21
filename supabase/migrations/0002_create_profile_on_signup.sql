-- Create a profile row automatically when a new user signs up.
-- This keeps auth.users and public.profiles in sync without extra client code.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    dietary_restrictions,
    allergies,
    taste_preferences,
    skill_level,
    household_size
  )
  values (
    new.id,
    '{}',
    '{}',
    '{}',
    'beginner',
    1
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Only attach the trigger if it doesn't already exist.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'on_auth_user_created'
      and tgrelid = 'auth.users'::regclass
  ) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row
      execute function public.handle_new_user();
  end if;
end
$$;
