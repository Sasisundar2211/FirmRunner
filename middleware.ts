import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — MUST be called before checking auth
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Auth routes: redirect to dashboard if already logged in
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/signup')
  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Protected routes: redirect to login if not authenticated
  const isPublicRoute =
    isAuthRoute ||
    pathname.startsWith('/api/webhooks') ||
    pathname.startsWith('/api/client-response')  // public acknowledge links (no auth)
  if (!isPublicRoute && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all routes except static files and Next.js internals
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
