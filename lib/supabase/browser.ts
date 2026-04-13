'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'

let client: ReturnType<typeof createBrowserClient<Database>> | undefined

/**
 * Singleton browser-side Supabase client.
 * Use in Client Components only (files with 'use client').
 */
export function getSupabaseBrowserClient() {
  if (!client) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    // Debug: logs first 20 chars so you can verify the var is embedded in the bundle.
    // Remove once auth is confirmed working.
    console.log('[supabase] URL prefix:', supabaseUrl?.substring(0, 20) ?? 'UNDEFINED')
    console.log('[supabase] Anon key set:', !!supabaseAnonKey)

    if (!supabaseUrl) {
      throw new Error(
        'Missing NEXT_PUBLIC_SUPABASE_URL — add it to .env.local or Vercel project settings.'
      )
    }
    if (!supabaseAnonKey) {
      throw new Error(
        'Missing NEXT_PUBLIC_SUPABASE_ANON_KEY — add it to .env.local or Vercel project settings.'
      )
    }

    client = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)
  }
  return client
}
