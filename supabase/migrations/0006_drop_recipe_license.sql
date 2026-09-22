-- Remove the license column; we now track only the recipe source.
alter table public.recipes drop column if exists license;
