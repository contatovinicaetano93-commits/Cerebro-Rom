#!/usr/bin/env node
/**
 * Fail if unit DATABASE_URL envs point at Neon (dead/quota).
 * Brasil + Iguatemi must use Supabase pooler (*.supabase.com).
 * Env names NEON_* are legacy; values must be Supabase.
 *
 * Usage:
 *   NEON_BRASIL_DATABASE_URL=... NEON_IGUATEMI_DATABASE_URL=... node scripts/check-brasil-db-host.mjs
 *   npm run check:brasil-db-host
 */

function check(label, envName) {
  const url = (process.env[envName] || '').trim()
  if (!url) {
    console.log(`check-db-host SKIP: ${envName} unset (${label})`)
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
    console.error(`  (Env var name ${envName} is legacy; value must be Supabase.)`)
    return 1
  }

  if (!/supabase\.com$/i.test(host) && !/\.supabase\.com$/i.test(host)) {
    console.warn(
      `check-db-host WARN: ${label} host ${host} is not *.supabase.com — confirm intentional.`,
    )
  }

  console.log(`check-db-host OK: ${label} host=${host}`)
  return 0
}

const code =
  check('Brasil', 'NEON_BRASIL_DATABASE_URL') |
  check('Iguatemi', 'NEON_IGUATEMI_DATABASE_URL')

process.exit(code)
