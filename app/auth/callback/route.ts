import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * GET /auth/callback
 *
 * Supabase redirects here after email confirmation, magic link, and OAuth.
 * PKCE flow: the URL contains `?code=...` which must be exchanged for a session.
 * Error flow: the URL contains `?error=...` when the link is invalid or expired.
 *
 * Configure in Supabase Dashboard:
 *   Authentication → URL Configuration → Redirect URLs → add:
 *   https://yourdomain.com/auth/callback
 *
 *   Authentication → URL Configuration → Site URL:
 *   https://yourdomain.com
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)

  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const errorCode = searchParams.get('error_code')
  const next = searchParams.get('next') ?? '/dashboard'

  // Supabase signals an error (expired link, already used, etc.)
  if (error) {
    const params = new URLSearchParams({ error, ...(errorCode ? { error_code: errorCode } : {}) })
    return NextResponse.redirect(`${origin}/login?${params}`)
  }

  if (!code) {
    // No code and no error — malformed link
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const cookieStore = await cookies()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError) {
    console.error('[auth/callback] exchangeCodeForSession failed:', exchangeError.message)
    // For the reset-password flow, send back to that page with an error rather than login
    if (next === '/auth/reset-password') {
      return NextResponse.redirect(`${origin}/auth/reset-password?error=invalid_link`)
    }
    const params = new URLSearchParams({
      error: 'auth_error',
      error_code: exchangeError.message,
    })
    return NextResponse.redirect(`${origin}/login?${params}`)
  }

  // Session established — forward to the intended destination
  return NextResponse.redirect(`${origin}${next}`)
}
