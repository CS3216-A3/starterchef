# Skill: Create and run Supabase migrations

Use this whenever a new database migration is written or an existing one is
changed, to keep the live Supabase project in sync with the repo.

## Project reference

- Project ref: `mgpnalwharsdhhnjskuc`
- Local migration folder: `supabase/migrations/`

## Requirements

- Supabase CLI installed globally or runnable via `npx supabase`.
- You are signed in (`supabase login`) and can push to the linked project.

## Workflow

1. Link the local project (only once per session; safe to repeat):

   ```bash
   supabase link --project-ref mgpnalwharsdhhnjskuc
   ```

2. If you need a fresh migration file, create it with a descriptive name:

   ```bash
   supabase migration new <snake_case_description>
   ```

   The CLI will create `supabase/migrations/NNNN_snake_case_description.sql`.

3. Write or edit the SQL file in `supabase/migrations/`.

4. Push all migrations to the linked project:

   ```bash
   supabase db push
   ```

5. If the schema changed in a way that breaks existing seed data (e.g. dropped
   columns), re-run the seed file manually in the Supabase SQL editor:

   ```bash
   supabase seed run
   ```

   Or open `supabase/seed/recipes.sql` in the SQL editor and run it.

## Safety rules

- Always use `if not exists` / `if exists` for destructive DDL when possible.
- Never commit secrets or the Supabase service role key.
- If a migration fails mid-push, check the error, fix the SQL, and re-run
  `supabase db push`. Do not hand-edit migration history on the server.
- When removing a column that contains data, warn the user and ask before
  running the push.
