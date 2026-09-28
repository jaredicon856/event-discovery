import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Session-bound Supabase client for server components/route handlers — reads
 * the signed-in user's cookies, respects RLS (unlike getSupabaseServiceClient
 * in lib/supabase.ts, which bypasses RLS entirely and must never be exposed
 * to unauthenticated requests).
 */
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // setAll is called from a Server Component sometimes — middleware
          // already refreshes the session, so this can be safely ignored.
        }
      },
    },
  });
}
