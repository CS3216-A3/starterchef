---
name: db-migration
description: Write a Supabase migration following StarterChef conventions
argument-hint: "<what to change>"
---

Create a new migration in `supabase/migrations/` named with the next
zero-padded number, e.g. `0002_<snake_case_description>.sql`.

Conventions:

1. Read `supabase/migrations/0001_init.sql` first — match its style.
2. Every user-data table gets `user_id uuid references public.profiles(id)`
   and row-level security:
   ```sql
   alter table public.<table> enable row level security;
   create policy "<table>: own rows only" on public.<table>
     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
   ```
3. Use `check` constraints for enum-ish columns instead of creating enum types.
4. Add indexes for columns the app will filter on (usually `user_id`).
5. Never store secrets or AI provider keys in the database.
6. Note in your summary that the user must run the migration in the Supabase
   SQL editor or via `supabase db push` — it is not applied automatically.
