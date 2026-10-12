import { NextResponse } from 'next/server'
import {
  AUTH_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  isAuthEnabled,
  isSessionSigningReady,
  mustEnforceAuth,
  useSecureCookies,
  validateAdminCredentials,
} from '@/lib/auth'
import { isLoginBlocked, recordLoginFailure } from '@/lib/auth-rate-limit'
import { LoginRequestSchema } from '@/lib/schemas'

/** 10 falhas / 15 min por IP — sucesso não consome cota. */
const LOGIN_MAX_FAILURES = 10
const LOGIN_WINDOW_SEC = 15 * 60

function clientKey(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return `login:${forwarded || req.headers.get('x-real-ip') || 'unknown'}`
}

export async function POST(req: Request) {
  if (!isAuthEnabled() || !isSessionSigningReady()) {
    if (mustEnforceAuth()) {
      return NextResponse.json(
        {
          error:
            'Auth não configurado — defina CEREBRO_ADMIN_PASSWORD e CEREBRO_SESSION_SECRET',
        },
        { status: 503 },
      )
    }
    if (!isAuthEnabled()) {
      return NextResponse.json({ data: { auth: 'disabled' } })
    }
    return NextResponse.json(
      { error: 'CEREBRO_SESSION_SECRET não configurado' },
      { status: 503 },
    )
  }

  const limitKey = clientKey(req)
  if (await isLoginBlocked(limitKey, LOGIN_MAX_FAILURES, LOGIN_WINDOW_SEC)) {
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
    await recordLoginFailure(limitKey, LOGIN_MAX_FAILURES, LOGIN_WINDOW_SEC)
    return NextResponse.json({ error: 'Usuário ou senha incorretos' }, { status: 401 })
  }

  try {
    const token = await createSessionToken()
    const res = NextResponse.json({ data: { auth: 'ok' } })
    res.cookies.set(AUTH_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: useSecureCookies(),
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
