-- Correct recipe attribution defaults and any previously seeded rows.
-- The original seed incorrectly claimed the demo recipes were CC0 / project
-- originals. They are common placeholder dishes whose real authors and
-- licenses are unknown.

alter table public.recipes
  alter column source set default 'Unknown — verify before publication';

alter table public.recipes
  alter column license set default 'Unknown — verify before publication';

update public.recipes
set
  source = 'Unknown — verify before publication',
  license = 'Unknown — verify before publication'
where source = 'StarterChef original'
  and license = 'CC0-1.0';
