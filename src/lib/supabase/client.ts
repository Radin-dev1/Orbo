"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client. `createBrowserClient` memoizes a singleton
 * internally per set of args, so calling this repeatedly is fine.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
