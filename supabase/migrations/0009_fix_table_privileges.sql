-- Fix missing table privileges so the authenticated app role (and the
-- service_role used by admin scripts) can read and write the recipe tables.
-- This migration is idempotent and safe to re-run.

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on table public.recipes to authenticated, service_role;
grant select, insert, update, delete on table public.saved_recipes to authenticated, service_role;
grant select, insert, update, delete on table public.recipe_feedback to authenticated, service_role;

-- Ensure the sequences backing default primary keys are usable too.
grant usage, select on all sequences in schema public to authenticated, service_role;
