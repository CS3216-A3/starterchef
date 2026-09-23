-- Private, owner-scoped storage for pantry scans and user recipe media.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('kitchen-images', 'kitchen-images', false, 8388608, array['image/jpeg','image/png','image/webp']),
  ('recipe-inputs', 'recipe-inputs', false, 20971520, array[
    'image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'
  ])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "private user media: insert own objects" on storage.objects;
drop policy if exists "private user media: select own objects" on storage.objects;
drop policy if exists "private user media: delete own objects" on storage.objects;

create policy "private user media: insert own objects"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('kitchen-images', 'recipe-inputs')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "private user media: select own objects"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('kitchen-images', 'recipe-inputs')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "private user media: delete own objects"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('kitchen-images', 'recipe-inputs')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
