-- AI-chosen icon per kitchen item. The scan/voice models pick a key from a
-- fixed vocabulary (see KITCHEN_ICON_KEYS in src/lib/item-icons.ts); rows
-- without one (manual adds, pre-existing data) fall back to keyword matching.
alter table public.kitchen_items add column if not exists icon text;
