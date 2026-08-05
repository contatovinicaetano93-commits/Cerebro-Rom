#!/usr/bin/env node
/**
 * Fail if unit DATABASE_URL envs are not Supabase pooler.
 * Env canônica: UNIT_*; NEON_* é alias legado. Valores devem ser aws-*.pooler.supabase.com.
 *
 * Usage:
 *   UNIT_BRASIL_DATABASE_URL=... UNIT_IGUATEMI_DATABASE_URL=... node scripts/check-brasil-db-host.mjs
 *   npm run check:brasil-db-host
 */

function resolveEnvUrl(...envNames) {
  for (const envName of envNames) {
    const url = (process.env[envName] || '').trim()
    if (url) return { envName, url }
  }
  return { envName: envNames[0], url: '' }
}

function check(label, ...envNames) {
  const { envName, url } = resolveEnvUrl(...envNames)
  if (!url) {
    console.log(`check-db-host SKIP: ${envNames.join(' | ')} unset (${label})`)
    return 0
  }

  const m = url.match(/@([^/:?]+)/)
  const host = m?.[1] || ''

  if (!host) {
    console.error(`check-db-host FAILED: could not parse host from ${envName}`)
    return 1
  }

  if (/neon\.tech$/i.test(host) || /\.neon\.tech$/i.test(host)) {
    console.error(`check-db-host FAILED: ${envName} host is Neon (${host}).`)
    console.error(
      '  Use Supabase pooler (aws-*.pooler.supabase.com:5432 session or :6543 tx), ssl require, prepare:false.',
    )
    return 1
  }

  if (!/\.pooler\.supabase\.com$/i.test(host)) {
    console.error(
      `check-db-host FAILED: ${envName} host=${host} — require *.pooler.supabase.com (not db.*.supabase.co).`,
    )
    return 1
  }

  console.log(`check-db-host OK: ${label} host=${host} (${envName})`)
  return 0
}

const code =
  check('Brasil', 'UNIT_BRASIL_DATABASE_URL', 'NEON_BRASIL_DATABASE_URL') |
  check('Iguatemi', 'UNIT_IGUATEMI_DATABASE_URL', 'NEON_IGUATEMI_DATABASE_URL')

process.exit(code)
