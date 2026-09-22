-- Track the original URL for imported recipes so it can be shown to the user.
alter table public.recipes
  add column if not exists source_url text;
