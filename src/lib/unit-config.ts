import type { UnitMeta, UnitSlug } from '@/lib/types'
import { goalsFromEnv, type UnitGoals } from '@/lib/goals'

export interface UnitRuntimeConfig {
  meta: UnitMeta
  databaseUrl: string | null
  /** Bootstrap via env — prefer DB goals when present. */
  envGoals: UnitGoals
}

function numEnv(name: string): number {
  const raw = process.env[name]
  if (!raw?.trim()) return 0
  const n = Number(raw.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : 0
}

export const UNIT_META: Record<UnitSlug, UnitMeta> = {
  'rom-brasil': {
    slug: 'rom-brasil',
    name: 'ROM Brasil',
    short: 'Brasil',
    accent: '#c4a35a',
    panelUrl: 'https://rom-club.vercel.app',
  },
  'rom-iguatemi': {
    slug: 'rom-iguatemi',
    name: 'ROM Iguatemi',
    short: 'Iguatemi',
    accent: '#7eb8a8',
    panelUrl: 'https://rom-iguatemi.vercel.app',
  },
}

/** Relatório gerência (0011/0021) no painel da unidade. */
export function unitGerenciaUrl(slug: UnitSlug): string {
  return `${UNIT_META[slug].panelUrl}/admin/relatorio-diretoria`
}

/**
 * Unidades migraram para Supabase pooler.
 * Neon / host direto (db.*.supabase.co) → ausente (placeholder offline), não KPI falso.
 */
function resolveUnitDatabaseUrl(slug: UnitSlug, raw: string | null | undefined): string | null {
  const url = raw?.trim() || null
  if (!url) return null
  const envName =
    slug === 'rom-brasil' ? 'NEON_BRASIL_DATABASE_URL' : 'NEON_IGUATEMI_DATABASE_URL'
  if (/\.neon\.tech\b/i.test(url)) {
    console.error(
      `[cerebro] ${envName} aponta para Neon — use pooler Supabase (aws-*.pooler.supabase.com)`,
    )
    return null
  }
  const host = url.match(/@([^/:?]+)/)?.[1] || ''
  if (!/\.pooler\.supabase\.com$/i.test(host)) {
    console.error(
      `[cerebro] ${envName} host=${host || '?'} — use aws-*.pooler.supabase.com (session :5432 ou tx :6543)`,
    )
    return null
  }
  return url
}

export function getUnitConfigs(): UnitRuntimeConfig[] {
  return [
    {
      meta: UNIT_META['rom-brasil'],
      databaseUrl: resolveUnitDatabaseUrl(
        'rom-brasil',
        process.env.NEON_BRASIL_DATABASE_URL,
      ),
      envGoals: goalsFromEnv(numEnv('BRASIL_DAILY_GOAL'), numEnv('BRASIL_DAILY_CAPACITY')),
    },
    {
      meta: UNIT_META['rom-iguatemi'],
      databaseUrl: resolveUnitDatabaseUrl(
        'rom-iguatemi',
        process.env.NEON_IGUATEMI_DATABASE_URL,
      ),
      envGoals: goalsFromEnv(numEnv('IGUATEMI_DAILY_GOAL'), numEnv('IGUATEMI_DAILY_CAPACITY')),
    },
  ]
}

export function getUnitConfig(slug: UnitSlug): UnitRuntimeConfig | undefined {
  return getUnitConfigs().find((c) => c.meta.slug === slug)
}

export function todayIsoSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Primeiro dia capturável em Relatórios (alinha com gerência BR/IG desde 2025).
 * Métricas vêm de salon_daily_metrics nas unidades — dias sem sync voltam zerados.
 */
export const REPORT_AS_OF_EARLIEST = '2025-01-01'

/**
 * Valida dia ISO (YYYY-MM-DD) ≤ hoje (America/Sao_Paulo).
 * Usado em captura/export de relatório com data escolhida.
 */
export function parseAsOfDay(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!ISO_DAY_RE.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() + 1 !== m ||
    dt.getUTCDate() !== d
  ) {
    return null
  }
  const today = todayIsoSaoPaulo()
  if (s > today) return null
  if (s < REPORT_AS_OF_EARLIEST) return null
  return s
}

export function monthStartIso(dayIso: string): string {
  return `${dayIso.slice(0, 7)}-01`
}

export function dayOfMonth(dayIso: string): number {
  return Number(dayIso.slice(8, 10)) || 1
}

/** Horas úteis do salão por dia — usado para estimar capacidade nas próximas 2h. */
export const SALON_HOURS_PER_DAY = 8

/** Subtrai dias de uma data ISO (YYYY-MM-DD) sem depender do fuso do servidor. */
export function isoDaysBackFrom(dayIso: string, back: number): string {
  const [y, m, d] = dayIso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() - back)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}
