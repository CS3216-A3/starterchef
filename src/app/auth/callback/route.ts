import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * GET /auth/callback
 *
 * Handles the email confirmation link and OAuth redirects from Supabase Auth.
 * Exchanges the `code` for a session, then redirects to the app.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/today";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth-callback-failed`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return NextResponse.redirect(`${origin}/login?error=missing-env`);
  }

  const redirectResponse = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return [];
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          redirectResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth-callback-failed`);
  }

  return redirectResponse;
}
