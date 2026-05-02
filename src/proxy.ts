import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

// Paths that don't require authentication
const PUBLIC_PREFIXES = ['/login', '/setup', '/offline', '/api/']
const PUBLIC_EXACT = ['/']

// Static asset extensions — bypass entirely
const STATIC_RE = /\.(?:ico|png|jpg|jpeg|svg|webp|woff2?|mjs|js|css|map)$/i

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl

  // Let static assets through without touching cookies
  if (STATIC_RE.test(pathname) || pathname.startsWith('/_next/')) {
    return NextResponse.next()
  }

  // Public paths — no auth required
  if (
    PUBLIC_EXACT.includes(pathname) ||
    PUBLIC_PREFIXES.some(p => pathname.startsWith(p))
  ) {
    return NextResponse.next()
  }

  // Build a response object we can attach refreshed cookies to
  let response = NextResponse.next({ request })

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
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Validate session — always use getUser() (not getSession()) for server-side auth
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Verify org membership — authenticated users without an org go to /setup
  const { data: membership } = await supabase
    .from('org_members')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) {
    return NextResponse.redirect(new URL('/setup', request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT:
     *  - _next/static, _next/image (Next.js internals)
     *  - Static files (favicon, pdf worker, service worker, etc.)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|pdf\\.worker\\.min\\.mjs|sw\\.js).*)',
  ],
}
