-- Move the profile-creation trigger function out of the public schema so it
-- cannot be called directly via the Supabase REST API (PostgREST). It should
-- only run as a trigger on auth.users.

create schema if not exists private;

-- Drop the old public function (and its trigger dependency).
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- Recreate in the private schema.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = private, public
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

-- Ensure anon / authenticated roles cannot execute this function directly.
revoke execute on function private.handle_new_user() from public, anon, authenticated;

-- Re-attach the trigger.
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function private.handle_new_user();
