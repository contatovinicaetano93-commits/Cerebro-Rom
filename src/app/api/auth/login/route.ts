import { NextResponse } from 'next/server'
import {
  AUTH_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  isAuthEnabled,
  isProduction,
  validateAdminCredentials,
} from '@/lib/auth'
import { isLoginBlocked, recordLoginFailure } from '@/lib/auth-rate-limit'
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
  // 20 falhas / 15 min por IP — sucesso não consome cota.
  if (await isLoginBlocked(limitKey, 20, 15 * 60)) {
    return NextResponse.json(
      { error: 'Muitas tentativas — aguarde cerca de 15 minutos e tente de novo' },
      { status: 429 },
    )
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
    await recordLoginFailure(limitKey, 20, 15 * 60)
    return NextResponse.json({ error: 'Usuário ou senha incorretos' }, { status: 401 })
  }

  try {
    const token = await createSessionToken()
    const res = NextResponse.json({ data: { auth: 'ok' } })
    res.cookies.set(AUTH_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction(),
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    })
    return res
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Falha ao criar sessão' },
      { status: 500 },
    )
  }
}
