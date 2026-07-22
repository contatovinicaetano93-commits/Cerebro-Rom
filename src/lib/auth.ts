import type { NextRequest } from 'next/server'

export const AUTH_COOKIE = 'cerebro_session'
const DEFAULT_USER = 'waltter'

/** Sessão válida por 7 dias (cookie + claim `exp` no token). */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

export function getAdminUser() {
  return (process.env.CEREBRO_ADMIN_USER ?? DEFAULT_USER).trim()
}

export function getAdminPassword() {
  return (process.env.CEREBRO_ADMIN_PASSWORD ?? '').trim()
}

/** Secret dedicado da sessão; fallback = senha admin (legado). */
export function getSessionSecret() {
  return (
    process.env.CEREBRO_SESSION_SECRET?.trim() ||
    getAdminPassword()
  )
}

export function isAuthEnabled() {
  return Boolean(getAdminPassword())
}

/** Produção "de verdade" — não confundir com build de Preview do Vercel. */
export function isProduction() {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === 'production'
  return process.env.NODE_ENV === 'production'
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
    throw new Error('CEREBRO_SESSION_SECRET / CEREBRO_ADMIN_PASSWORD não configurados')
  }
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const payload = `cerebro-session:v1:${user}:${exp}`
  const sig = await hmacHex(secret, payload)
  return `v1.${exp}.${sig}`
}

export async function verifySessionToken(token: string): Promise<boolean> {
  const secret = getSessionSecret()
  if (!secret || !token) return false

  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return false

  const expStr = parts[1]!
  const sig = parts[2]!
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return false

  const user = getAdminUser()
  const expected = await hmacHex(secret, `cerebro-session:v1:${user}:${exp}`)
  return timingSafeEqual(sig, expected)
}

export function validateAdminCredentials(username: string, password: string) {
  const expectedUser = getAdminUser()
  const expectedPass = getAdminPassword()
  if (!expectedPass) return false
  return (
    timingSafeEqual(username.trim(), expectedUser) && timingSafeEqual(password, expectedPass)
  )
}

export async function isAuthorized(req: NextRequest) {
  // Produção sem CEREBRO_ADMIN_PASSWORD configurada = fechado (nunca abrir o
  // painel sem querer). Fora de produção sem senha = aberto (conveniência local).
  if (!isAuthEnabled()) return !isProduction()

  const session = req.cookies.get(AUTH_COOKIE)?.value
  if (!session) return false
  return verifySessionToken(session)
}
