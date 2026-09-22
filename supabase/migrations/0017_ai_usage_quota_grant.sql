-- ai_usage_quota predates the 0015 grant fix: authenticated users couldn't
-- read their own usage row. Select-only — increments go through the
-- service-role increment_ai_usage() function.
grant select on table public.ai_usage_quota to authenticated;
