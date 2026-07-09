import { NextResponse } from 'next/server'
import {
  AUTH_COOKIE,
  createSessionToken,
  getAdminUser,
  isAuthEnabled,
  validateAdminCredentials,
} from '@/lib/auth'

export async function POST(req: Request) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ data: { auth: 'disabled' } })
  }

  const body = await req.json().catch(() => null)
  const username = typeof body?.username === 'string' ? body.username : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  const user = username || getAdminUser()
  if (!password || !validateAdminCredentials(user, password)) {
    return NextResponse.json({ error: 'Usuário ou senha incorretos' }, { status: 401 })
  }

  const res = NextResponse.json({ data: { auth: 'ok' } })
  res.cookies.set(AUTH_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
