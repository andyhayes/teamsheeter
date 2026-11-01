import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Null when the app hasn't been configured with a Supabase project yet. */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true } }) : null;

export function db(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

/** Unwrap a Supabase response, throwing its error so React Query can show it. */
export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
