import { NextResponse } from 'next/server'
import { AUTH_COOKIE, isProduction } from '@/lib/auth'

export async function POST() {
  const res = NextResponse.json({ data: { auth: 'logged_out' } })
  res.cookies.set(AUTH_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    path: '/',
    maxAge: 0,
  })
  return res
}
