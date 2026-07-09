import type { UnitMeta, UnitSlug } from '@/lib/types'

export interface UnitRuntimeConfig {
  meta: UnitMeta
  databaseUrl: string | null
  dailyGoal: number
  capacity: number
}

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw?.trim()) return fallback
  const n = Number(raw.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const UNIT_META: Record<UnitSlug, UnitMeta> = {
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
      dailyGoal: numEnv('BRASIL_DAILY_GOAL', 5000),
      capacity: numEnv('BRASIL_DAILY_CAPACITY', 15),
    },
    {
      meta: UNIT_META['rom-iguatemi'],
      databaseUrl: process.env.NEON_IGUATEMI_DATABASE_URL?.trim() || null,
      dailyGoal: numEnv('IGUATEMI_DAILY_GOAL', 5000),
      capacity: numEnv('IGUATEMI_DAILY_CAPACITY', 14),
    },
  ]
}

export function todayIsoSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function monthStartIso(dayIso: string): string {
  return `${dayIso.slice(0, 7)}-01`
}

export function dayOfMonth(dayIso: string): number {
  return Number(dayIso.slice(8, 10)) || 1
}
