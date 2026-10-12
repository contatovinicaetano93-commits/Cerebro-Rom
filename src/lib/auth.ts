import { NextRequest, NextResponse } from 'next/server'

export const AUTH_COOKIE = 'cerebro_session'

/** Sessão válida por 7 dias (cookie + claim `exp` no token). */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

const DB_URL_ENV_KEYS = [
  'UNIT_BRASIL_DATABASE_URL',
  'BRASIL_DATABASE_URL',
  'NEON_BRASIL_DATABASE_URL',
  'UNIT_IGUATEMI_DATABASE_URL',
  'IGUATEMI_DATABASE_URL',
  'NEON_IGUATEMI_DATABASE_URL',
  'CEREBRO_DATABASE_URL',
] as const

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

export function getAdminUser() {
  return (process.env.CEREBRO_ADMIN_USER ?? '').trim()
}

export function getAdminPassword() {
  return (process.env.CEREBRO_ADMIN_PASSWORD ?? '').trim()
}

/**
 * HMAC da sessão — só `CEREBRO_SESSION_SECRET` (alta entropia).
 * Não assina com a senha admin (rotacionar senha não deve invalidar
 * sessões da mesma forma, e a senha não é chave criptográfica adequada).
 * Fallback com senha removido de propósito — configure o secret no Edge + Serverless.
 */
export function getSessionSecret() {
  return (process.env.CEREBRO_SESSION_SECRET ?? '').trim()
}

export function isAuthEnabled() {
  return Boolean(getAdminPassword())
}

export function isSessionSigningReady() {
  return Boolean(getSessionSecret())
}

/** Produção "de verdade" — não confundir com build de Preview do Vercel. */
export function isProduction() {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === 'production'
  return process.env.NODE_ENV === 'production'
}

/** Preview ou Production na Vercel (ou NODE_ENV=production fora dela). */
export function isDeployedStrictEnv() {
  const vercelEnv = process.env.VERCEL_ENV
  if (vercelEnv === 'production' || vercelEnv === 'preview') return true
  if (!vercelEnv && process.env.NODE_ENV === 'production') return true
  return false
}

/** Qualquer URL de DB ao vivo — auth aberto seria vazamento de dados reais. */
export function hasAnyDatabaseUrl() {
  return DB_URL_ENV_KEYS.some((key) => Boolean(process.env[key]?.trim()))
}

/**
 * Fail-closed: preview/prod Vercel, NODE_ENV=production, ou qualquer DB URL.
 * Só local sem DBs pode ficar aberto sem senha (emergência de desenvolvimento).
 */
export function mustEnforceAuth() {
  return isDeployedStrictEnv() || hasAnyDatabaseUrl()
}

/** Cookie `Secure` em qualquer deploy Vercel (preview incluso) ou HTTPS prod. */
export function useSecureCookies() {
  if (process.env.VERCEL === '1' || process.env.VERCEL_ENV) return true
  if (process.env.NODE_ENV === 'production') return true
  return false
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Token `v1.<expUnix>.<hmac>` — HMAC sobre `cerebro-session:v1:{user}:{exp}`.
 * Tokens legados (hex puro sem pontos) são rejeitados.
 */
export async function createSessionToken(ttlSeconds = SESSION_TTL_SECONDS): Promise<string> {
  const secret = getSessionSecret()
  const user = getAdminUser()
  if (!secret) {
    throw new Error('CEREBRO_SESSION_SECRET não configurado')
  }
  if (!user) {
    throw new Error('CEREBRO_ADMIN_USER não configurado')
  }
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const payload = `cerebro-session:v1:${user}:${exp}`
  const sig = await hmacHex(secret, payload)
  return `v1.${exp}.${sig}`
}

async function verifyWithSecret(token: string, secret: string): Promise<boolean> {
  if (!secret || !token) return false

  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return false

  const expStr = parts[1]!
  const sig = parts[2]!
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return false

  const user = getAdminUser()
  if (!user) return false
  const expected = await hmacHex(secret, `cerebro-session:v1:${user}:${exp}`)
  return timingSafeEqual(sig, expected)
}

/** Verifica só com `CEREBRO_SESSION_SECRET` — sem fallback na senha admin. */
export async function verifySessionToken(token: string): Promise<boolean> {
  return verifyWithSecret(token, getSessionSecret())
}

export function validateAdminCredentials(username: string, password: string) {
  const expectedUser = getAdminUser()
  const expectedPass = getAdminPassword()
  if (!expectedUser || !expectedPass) return false
  return (
    timingSafeEqual(username.trim(), expectedUser) &&
    timingSafeEqual(password.trim(), expectedPass)
  )
}

function readSessionCookie(req: NextRequest | Request): string | undefined {
  // Duck-type: NextRequest and test mocks expose `.cookies.get`.
  const cookies = (req as NextRequest).cookies
  if (cookies && typeof cookies.get === 'function') {
    return cookies.get(AUTH_COOKIE)?.value
  }
  const header = req.headers?.get?.('cookie')
  if (!header) return undefined
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const name = part.slice(0, idx).trim()
    if (name === AUTH_COOKIE) return decodeURIComponent(part.slice(idx + 1).trim())
  }
  return undefined
}

export async function isAuthorized(req: NextRequest | Request) {
  // Sem senha: aberto só em local sem DB; preview/prod/DB = fechado.
  if (!isAuthEnabled()) return !mustEnforceAuth()

  // Senha ok mas secret ausente = ninguém entra (fail-closed / sem assinatura).
  if (!isSessionSigningReady()) return false

  const session = readSessionCookie(req)
  if (!session) return false
  return verifySessionToken(session)
}

/**
 * Guard de handler — middleware sozinho não basta (bypass / edge gaps).
 * Retorna `NextResponse` 401/503 se bloqueado; `null` se ok.
 */
export async function requireSession(req: NextRequest | Request): Promise<NextResponse | null> {
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
    // Local sem auth: permite.
    if (!isAuthEnabled()) return null
  }

  if (await isAuthorized(req)) return null
  return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
}
