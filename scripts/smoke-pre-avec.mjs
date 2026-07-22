#!/usr/bin/env node
/**
 * Smoke test pré-Avec — valida deploy + schema Neon antes de terça.
 *
 * Uso:
 *   cd cerebro-rom
 *   node scripts/smoke-pre-avec.mjs
 *
 * Lê .env.local se existir (NEON_*_DATABASE_URL).
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dir, '..')

const REQUIRED_TABLES = [
  'salon_daily_metrics',
  'salon_p1_daily',
  'salon_p2_daily',
  'salon_p3_daily',
  'avec_sync_runs',
  'contacts',
]

const HTTP_CHECKS = [
  { name: 'Cérebro login', url: 'https://cerebro-rom.vercel.app/login', expect: 200 },
  { name: 'Cérebro health (auth)', url: 'https://cerebro-waltter.vercel.app/api/health', expect: 401 },
  { name: 'ROM Brasil health', url: 'https://rom-club.vercel.app/api/health', expect: 200 },
  { name: 'ROM Iguatemi health', url: 'https://rom-iguatemi.vercel.app/api/health', expect: 200 },
]

function loadEnvLocal() {
  const path = resolve(root, '.env.local')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i <= 0) continue
    const key = t.slice(0, i).trim()
    let val = t.slice(i + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

function pass(msg) {
  console.log(`  ✅ ${msg}`)
  return true
}

function warn(msg) {
  console.log(`  ⚠️  ${msg}`)
  return true
}

function fail(msg) {
  console.log(`  ❌ ${msg}`)
  return false
}

async function checkHttp() {
  console.log('\n## HTTP (produção)\n')
  let ok = true
  for (const c of HTTP_CHECKS) {
    try {
      const res = await fetch(c.url, { redirect: 'follow' })
      if (res.status === c.expect) pass(`${c.name} → ${res.status}`)
      else {
        ok = false
        fail(`${c.name} → ${res.status} (esperado ${c.expect})`)
      }
    } catch (e) {
      ok = false
      fail(`${c.name} → ${e instanceof Error ? e.message : e}`)
    }
  }
  return ok
}

async function checkNeon(label, url) {
  console.log(`\n## Neon · ${label}\n`)
  if (!url?.trim()) {
    fail('URL não configurada')
    return false
  }

  let ok = true
  const sql = neon(url)

  try {
    await sql`select 1 as ok`
    pass('Conexão OK')
  } catch (e) {
    fail(`Conexão: ${e instanceof Error ? e.message : e}`)
    return false
  }

  for (const table of REQUIRED_TABLES) {
    const rows = await sql`
      select to_regclass(${`public.${table}`}) is not null as ok
    `
    if (rows[0]?.ok) pass(`Tabela ${table}`)
    else {
      ok = false
      fail(`Tabela ${table} ausente — rodar db/delta-* no Neon`)
    }
  }

  const counts = await sql`
    select 'salon_daily_metrics' as t, count(*)::int as n from salon_daily_metrics
    union all select 'salon_p1_daily', count(*)::int from salon_p1_daily
    union all select 'salon_p2_daily', count(*)::int from salon_p2_daily
    union all select 'salon_p3_daily', count(*)::int from salon_p3_daily
    union all select 'avec_sync_runs', count(*)::int from avec_sync_runs
    order by t
  `

  console.log('\n  Contagens:')
  for (const row of counts) {
    const n = Number(row.n)
    const line = `    ${row.t}: ${n}`
    if (row.t.startsWith('salon_p') && n === 0) {
      warn(`${line} (vazio até sync full com token — OK pré-terça)`)
    } else if (row.t === 'avec_sync_runs' && n === 0) {
      warn(`${line} (nenhum sync ainda — OK se sem token)`)
    } else {
      console.log(line)
    }
  }

  return ok
}

async function checkCerebroOverview() {
  console.log('\n## Cérebro · overview\n')
  warn('Para teste completo com buildOverview: npm run smoke:full')
  return true
}

async function main() {
  console.log('Smoke test pré-Avec · ROM + Cérebro')
  console.log(`Data: ${new Date().toISOString()}`)

  loadEnvLocal()

  const results = [
    await checkHttp(),
    await checkNeon('Brasil', process.env.NEON_BRASIL_DATABASE_URL),
    await checkNeon('Iguatemi', process.env.NEON_IGUATEMI_DATABASE_URL),
  ]

  // overview: use npm run smoke:full
  try {
    results.push(await checkCerebroOverview())
  } catch {
    warn('Overview: npm run smoke:full')
  }

  const allOk = results.every(Boolean)
  console.log(allOk ? '\n✅ Smoke OK — pronto para terça (falta só token Avec)\n' : '\n❌ Corrigir itens acima\n')
  process.exit(allOk ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
