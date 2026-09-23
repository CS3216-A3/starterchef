-- All user-owned media now writes to private recipe-inputs. Keep public read
-- for catalogue assets, but remove every authenticated owner-write policy.

drop policy if exists "recipe-images: owner write" on storage.objects;

-- Defence in depth: authenticated users only need object privileges exercised
-- through the explicit private-bucket policies in 0019.
revoke update on table storage.objects from authenticated;
