-- Run read-only in the linked non-production Supabase SQL editor before
-- applying 0018/0019. Any row returned by the final query must be reconciled
-- without deleting user data before migrations are applied.

select version from supabase_migrations.schema_migrations order by version;

select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename in (
  'kitchen_items', 'ai_usage_quota', 'recipes', 'profiles', 'ai_calls'
)) or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
order by id;

select id, user_id, kind, name, quantity, expires_on
from public.kitchen_items
where btrim(name) = ''
   or char_length(btrim(name)) > 120
   or char_length(btrim(coalesce(quantity, ''))) > 120
   or (kind = 'equipment' and expires_on is not null)
   or kind not in ('ingredient', 'equipment')
union all
select min(id::text)::uuid, user_id, kind, min(name), min(quantity), min(expires_on)
from public.kitchen_items
group by user_id, kind, lower(btrim(name))
having count(*) > 1;
