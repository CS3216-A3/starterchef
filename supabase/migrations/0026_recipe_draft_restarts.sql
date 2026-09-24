-- Separate user-requested workflow restarts from the content revision used
-- during adjudication. Provider outages must be recoverable without a new
-- upload or quota charge.
alter table public.recipe_drafts
  add column if not exists restart_count integer not null default 0
  check (restart_count between 0 and 2);
