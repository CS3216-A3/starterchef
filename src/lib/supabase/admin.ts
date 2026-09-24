import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Admin Supabase client — bypasses RLS. Use only in trusted server contexts
 * (e.g. webhooks, auth callbacks, seed scripts). Never expose to the browser.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "Admin Supabase env vars missing — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.",
    );
  }
  return createSupabaseClient(url, key);
}
