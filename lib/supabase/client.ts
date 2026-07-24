import { createBrowserClient } from '@supabase/ssr'

export function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables in .env.local')
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}