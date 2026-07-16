import { NextResponse } from 'next/server'
import {
  AUTH_COOKIE,
  createSessionToken,
  isAuthEnabled,
  isProduction,
  validateAdminCredentials,
} from '@/lib/auth'
import { LoginRequestSchema } from '@/lib/schemas'

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

  const validation = LoginRequestSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.errors[0]?.message || 'Dados inválidos' },
      { status: 400 },
    )
  }

  const { username, password } = validation.data

  if (!validateAdminCredentials(username, password)) {
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
