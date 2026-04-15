import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    // Fail loudly with a clear message instead of a cryptic Supabase "Invalid URL" error
    throw new Error(
      'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and ' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in Vercel project settings.'
    )
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Write updated cookies to the request (for downstream server code)
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          // Rebuild supabaseResponse so the Set-Cookie headers go out to the browser
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // MUST call getUser() (not getSession()) — validates JWT with Supabase's server,
  // prevents forged cookies, and triggers a silent token refresh when needed.
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // ─── Public route list ────────────────────────────────────────────────────
  //
  // These routes must be reachable without a Supabase session.
  // Each one does its own auth inside the handler.
  //
  // /auth/callback      — PKCE code exchange after email confirmation / magic link
  // /login, /signup     — auth forms
  // /api/webhooks       — Stripe + Tally (verified by signature, not session)
  // /api/agents         — n8n scheduled triggers (verified by Bearer AGENT_SECRET)
  // /api/client-response— public "Acknowledge" links sent to clients
  // ─────────────────────────────────────────────────────────────────────────
  const isAuthRoute =
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/forgot-password')

  const isPublicRoute =
    isAuthRoute ||
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/auth/reset-password') ||
    pathname.startsWith('/api/webhooks') ||
    pathname.startsWith('/api/agents') ||
    pathname.startsWith('/api/client-response')

  // Authenticated user visiting login/signup → send to dashboard
  if (isAuthRoute && user) {
    return redirectWithCookies('/dashboard', request, supabaseResponse)
  }

  // Unauthenticated user visiting a protected route → send to login
  if (!isPublicRoute && !user) {
    return redirectWithCookies('/login', request, supabaseResponse)
  }

  // Pass through — supabaseResponse carries any refreshed token cookies
  return supabaseResponse
}

/**
 * Build a redirect response that carries the session cookies from supabaseResponse.
 *
 * Without this, a token refresh that happens during the middleware getUser() call
 * would write updated cookies to supabaseResponse — but if we then return a plain
 * NextResponse.redirect(), those cookies are dropped. The browser never stores the
 * refreshed token, the next request sees the old one, and we get a redirect loop.
 */
function redirectWithCookies(
  destination: string,
  request: NextRequest,
  supabaseResponse: NextResponse,
): NextResponse {
  const url = new URL(destination, request.url)
  const response = NextResponse.redirect(url)
  // Copy every cookie (including any refreshed Supabase token) to the redirect response
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie.name, cookie.value)
  })
  return response
}

export const config = {
  matcher: [
    // Run on all paths except Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
