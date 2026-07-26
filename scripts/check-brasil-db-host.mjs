#!/usr/bin/env node
/**
 * Fail if NEON_BRASIL_DATABASE_URL points at Neon (dead BR Neon).
 * Brasil must use Supabase pooler (*.supabase.com). Iguatemi may stay on neon.tech.
 *
 * Usage:
 *   NEON_BRASIL_DATABASE_URL=... node scripts/check-brasil-db-host.mjs
 *   npm run check:brasil-db-host
 */
const url = (process.env.NEON_BRASIL_DATABASE_URL || '').trim()

if (!url) {
  console.log('check-brasil-db-host SKIP: NEON_BRASIL_DATABASE_URL unset')
  process.exit(0)
}

const m = url.match(/@([^/:?]+)/)
const host = m?.[1] || ''

if (!host) {
  console.error('check-brasil-db-host FAILED: could not parse host from NEON_BRASIL_DATABASE_URL')
  process.exit(1)
}

if (/neon\.tech$/i.test(host) || /\.neon\.tech$/i.test(host)) {
  console.error(
    `check-brasil-db-host FAILED: NEON_BRASIL_DATABASE_URL host is Neon (${host}).`,
  )
  console.error(
    '  Use Supabase pooler (aws-*.pooler.supabase.com:5432 session or :6543 tx), ssl require, prepare:false.',
  )
  console.error('  (Env var name NEON_BRASIL_* is legacy; value must be Supabase.)')
  process.exit(1)
}

if (!/supabase\.com$/i.test(host) && !/\.supabase\.com$/i.test(host)) {
  console.warn(
    `check-brasil-db-host WARN: host ${host} is not *.supabase.com — confirm this is intentional for Brasil.`,
  )
}

console.log(`check-brasil-db-host OK: Brasil host=${host}`)
