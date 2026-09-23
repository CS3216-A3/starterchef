-- Durable verification now accepts pasted recipes and web recipe sources in
-- addition to generated, photo, adapted, and YouTube drafts.
alter table public.recipe_drafts
  drop constraint if exists recipe_drafts_kind_check;

alter table public.recipe_drafts
  add constraint recipe_drafts_kind_check
  check (kind in ('generated', 'photo', 'youtube', 'adapted', 'text', 'url'));
