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
  },
  'rom-iguatemi': {
    slug: 'rom-iguatemi',
    name: 'ROM Iguatemi',
    short: 'Iguatemi',
    accent: '#7eb8a8',
  },
}

export function getUnitConfigs(): UnitRuntimeConfig[] {
  return [
    {
      meta: UNIT_META['rom-brasil'],
      databaseUrl: process.env.NEON_BRASIL_DATABASE_URL?.trim() || null,
      envGoals: goalsFromEnv(numEnv('BRASIL_DAILY_GOAL'), numEnv('BRASIL_DAILY_CAPACITY')),
    },
    {
      meta: UNIT_META['rom-iguatemi'],
      databaseUrl: process.env.NEON_IGUATEMI_DATABASE_URL?.trim() || null,
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

/** Valida YYYY-MM-DD (calendário gregoriano). */
export function isIsoDay(value: string): boolean {
  if (!ISO_DAY_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  )
}

/**
 * Resolve o dia de referência do relatório/overview.
 * - vazio → hoje (America/Sao_Paulo)
 * - futuro → rejeita
 * - mais de ~2 anos atrás → rejeita
 */
export function resolveAsOfDay(raw?: string | null): string {
  const today = todayIsoSaoPaulo()
  const day = (raw ?? '').trim()
  if (!day) return today
  if (!isIsoDay(day)) {
    throw new Error('Dia inválido — use YYYY-MM-DD')
  }
  if (day > today) {
    throw new Error('Dia não pode ser no futuro')
  }
  const earliest = isoDaysBackFrom(today, 730)
  if (day < earliest) {
    throw new Error('Dia fora do histórico disponível (máx. 2 anos)')
  }
  return day
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
