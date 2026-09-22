-- Grant privileges on ALL app tables. 0009 only covered the recipe tables;
-- profiles, kitchen_items, cooking_sessions and ai_calls were still
-- inaccessible, which broke onboarding redirects, the kitchen inventory,
-- cooking session creation, and session_events inserts (their RLS policy
-- checks ownership via cooking_sessions).

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on table public.profiles to authenticated, service_role;
grant select, insert, update, delete on table public.kitchen_items to authenticated, service_role;
grant select, insert, update, delete on table public.cooking_sessions to authenticated, service_role;
grant select, insert, update, delete on table public.ai_calls to authenticated, service_role;

grant usage, select on all sequences in schema public to authenticated, service_role;

-- Durable fix: tables created by future migrations inherit sane grants
-- instead of silently denying the app roles.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
