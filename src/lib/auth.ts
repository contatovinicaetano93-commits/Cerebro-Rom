import type { NextRequest } from 'next/server'

export const AUTH_COOKIE = 'cerebro_session'
const DEFAULT_USER = 'waltter'

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

export function isAuthEnabled() {
  return Boolean(getAdminPassword())
}

/** Produção "de verdade" — não confundir com build de Preview do Vercel. */
export function isProduction() {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === 'production'
  return process.env.NODE_ENV === 'production'
}

/** HMAC-SHA256 compatível com Edge Runtime (Web Crypto). */
export async function createSessionToken() {
  const password = getAdminPassword()
  const user = getAdminUser()
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`cerebro-session:${user}`))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
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
  const expected = await createSessionToken()
  return timingSafeEqual(session, expected)
}
