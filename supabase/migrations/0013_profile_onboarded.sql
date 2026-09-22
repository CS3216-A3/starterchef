-- Track whether the user has completed the first-run onboarding wizard.

alter table public.profiles
  add column if not exists onboarded_at timestamptz;
