import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAuthEnabled, isAuthorized, isProduction } from '@/lib/auth'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (
    pathname === '/login' ||
    pathname.startsWith('/api/auth/') ||
    pathname === '/monitoring' ||
    pathname.startsWith('/monitoring/')
  ) {
    return NextResponse.next()
  }

  if (!isAuthEnabled() && isProduction()) {
    const msg = 'Auth não configurado — defina CEREBRO_ADMIN_PASSWORD na Vercel'
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: msg }, { status: 503 })
    }
    return new NextResponse(msg, { status: 503 })
  }

  if (await isAuthorized(req)) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const login = new URL('/login', req.url)
  login.searchParams.set('next', pathname || '/')
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
