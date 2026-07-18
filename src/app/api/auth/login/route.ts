import { NextResponse } from 'next/server'
import {
  AUTH_COOKIE,
  createSessionToken,
  isAuthEnabled,
  isProduction,
  validateAdminCredentials,
} from '@/lib/auth'
import { RateLimiter } from '@/lib/rate-limiter'
import { LoginRequestSchema } from '@/lib/schemas'

function clientKey(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return `login:${forwarded || req.headers.get('x-real-ip') || 'unknown'}`
}

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

  const limitKey = clientKey(req)
  // 10 tentativas / 15 min por IP (in-memory; bom o bastante em serverless curto).
  if (!RateLimiter.checkLimit(limitKey, 10, 15 * 60)) {
    return NextResponse.json({ error: 'Muitas tentativas — aguarde e tente de novo' }, { status: 429 })
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
