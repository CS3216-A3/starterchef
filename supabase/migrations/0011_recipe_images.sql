-- Recipe images: hero photo captured from the import source or uploaded by the
-- user, plus per-step photos taken while cooking.

alter table public.recipes
  add column if not exists image_url text;

-- Public bucket for recipe hero images and step photos. Files are stored under
-- a per-user folder prefix: {user_id}/{recipe_id}/{name}.
insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', true)
on conflict (id) do nothing;

-- Anyone (including anonymous page views) can read images.
drop policy if exists "recipe-images: public read" on storage.objects;
create policy "recipe-images: public read"
  on storage.objects
  for select
  using (bucket_id = 'recipe-images');

-- Users manage files inside their own uid folder only.
drop policy if exists "recipe-images: owner write" on storage.objects;
create policy "recipe-images: owner write"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
