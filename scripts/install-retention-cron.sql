-- Run after storing the deployed retention URL and CRON_SECRET in Supabase
-- Vault as starterchef_retention_url and starterchef_cron_secret. The URL must
-- be the complete HTTPS /api/cron/retention endpoint.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'starterchef_retention_url')
    or not exists (select 1 from vault.decrypted_secrets where name = 'starterchef_cron_secret') then
    raise exception 'Configure the retention URL and secret in Supabase Vault first';
  end if;
end $$;

select cron.schedule(
  'starterchef-retention-hourly',
  '0 * * * *',
  $job$
    select net.http_get(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'starterchef_retention_url'),
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'starterchef_cron_secret')
      ),
      timeout_milliseconds := 30000
    );
  $job$
);
