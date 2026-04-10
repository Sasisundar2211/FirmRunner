import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from './types'

/**
 * Server-side Supabase client that reads/writes the auth cookie.
 * Use in Server Components, Route Handlers, and Server Actions.
 */
export function createClient() {
  const cookieStore = cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll called from a Server Component — middleware handles refresh
          }
        },
      },
    }
  )
}

/**
 * Service-role admin client — bypasses RLS.
 * Only use in trusted server contexts (webhooks, cron jobs, migrations).
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

/**
 * Returns the current session's firm_id.
 * Throws if the user is not authenticated or has no firm association.
 */
export async function getSessionFirmId(): Promise<string> {
  const supabase = createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthenticated')

  const { data: firmUser } = await supabase
    .from('firm_users')
    .select('firm_id')
    .eq('user_id', user.id)
    .single()

  if (!firmUser) throw new Error('No firm association found')
  return firmUser.firm_id
}
