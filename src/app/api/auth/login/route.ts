import { NextResponse } from 'next/server'
import {
  AUTH_COOKIE,
  createSessionToken,
  isAuthEnabled,
  isProduction,
  validateAdminCredentials,
} from '@/lib/auth'

export async function POST(req: Request) {
  if (!isAuthEnabled()) {
    if (isProduction()) {
      return NextResponse.json(
        { error: 'Auth não configurado — defina CEREBRO_ADMIN_PASSWORD' },
        { status: 503 },
      )
    }
    return NextResponse.json({ data: { auth: 'disabled' } })
  }

  const body = await req.json().catch(() => null)
  const username = typeof body?.username === 'string' ? body.username.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  // Usuário precisa ser informado explicitamente — não completar com o admin
  // default, senão um atacante só precisa acertar a senha.
  if (!username || !password || !validateAdminCredentials(username, password)) {
    return NextResponse.json({ error: 'Usuário ou senha incorretos' }, { status: 401 })
  }

  const res = NextResponse.json({ data: { auth: 'ok' } })
  res.cookies.set(AUTH_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
