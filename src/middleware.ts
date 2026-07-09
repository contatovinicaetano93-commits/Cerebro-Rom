import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAuthorized, isAuthEnabled } from '@/lib/auth'

export async function middleware(req: NextRequest) {
  if (!isAuthEnabled()) return NextResponse.next()

  const { pathname } = req.nextUrl

  if (pathname === '/login' || pathname.startsWith('/api/auth/')) {
    return NextResponse.next()
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
  matcher: ['/', '/login', '/api/:path*'],
}
