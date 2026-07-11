#!/usr/bin/env npx tsx
/**
 * Smoke test completo — HTTP + Neon + buildOverview local.
 * Uso: npm run smoke:full
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'
import { buildOverview } from '../src/lib/live/overview'

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

function pass(msg: string) {
  console.log(`  ✅ ${msg}`)
}

function warn(msg: string) {
  console.log(`  ⚠️  ${msg}`)
}

function fail(msg: string) {
  console.log(`  ❌ ${msg}`)
}

async function checkHttp(): Promise<boolean> {
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

async function checkNeon(label: string, url: string | undefined): Promise<boolean> {
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
    const rows = (await sql`
      select to_regclass(${`public.${table}`}) is not null as ok
    `) as { ok: boolean }[]
    if (rows[0]?.ok) pass(`Tabela ${table}`)
    else {
      ok = false
      fail(`Tabela ${table} ausente`)
    }
  }

  const counts = (await sql`
    select 'salon_daily_metrics' as t, count(*)::int as n from salon_daily_metrics
    union all select 'salon_p1_daily', count(*)::int from salon_p1_daily
    union all select 'salon_p2_daily', count(*)::int from salon_p2_daily
    union all select 'salon_p3_daily', count(*)::int from salon_p3_daily
    union all select 'avec_sync_runs', count(*)::int from avec_sync_runs
    order by t
  `) as { t: string; n: number }[]

  console.log('\n  Contagens:')
  for (const row of counts) {
    const line = `    ${row.t}: ${row.n}`
    if (row.t.startsWith('salon_p') && row.n === 0) warn(`${line} (vazio até token — OK)`)
    else if (row.t === 'avec_sync_runs' && row.n === 0) warn(`${line} (sem sync ainda — OK)`)
    else console.log(line)
  }

  return ok
}

async function checkOverview(): Promise<boolean> {
  console.log('\n## Cérebro · buildOverview\n')
  try {
    const data = await buildOverview()
    pass(`mode=${data.mode} units=${data.units.length}`)
    for (const u of data.units) {
      const w = u.opsWeek.professionals.length + u.opsWeek.services.length
      const c = u.opsCommerce.bookingChannels.length + u.opsCommerce.packages.length
      console.log(`    ${u.unit.short}: sync=${u.sync.status} semana=${w} comercial=${c}`)
    }
    if (data.comparison) pass('Comparativo Brasil vs Iguatemi OK')
    return true
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e))
    return false
  }
}

async function main() {
  console.log('Smoke test completo · pré-Avec')
  loadEnvLocal()

  const ok = [
    await checkHttp(),
    await checkNeon('Brasil', process.env.NEON_BRASIL_DATABASE_URL),
    await checkNeon('Iguatemi', process.env.NEON_IGUATEMI_DATABASE_URL),
    await checkOverview(),
  ].every(Boolean)

  console.log(ok ? '\n✅ Tudo OK\n' : '\n❌ Verificar falhas\n')
  process.exit(ok ? 0 : 1)
}

main()
