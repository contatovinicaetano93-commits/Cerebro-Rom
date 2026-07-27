import type { UnitSnapshot } from '@/lib/types'

/** Unidade com movimento no dia — evita tratar fechado/pré-abertura como crise. */
export function isSalonActiveToday(u: UnitSnapshot): boolean {
  return u.today.revenue > 0 || u.today.appointments > 0 || u.today.attended > 0
}

/** Sync quebrado (token) — não tratar zeros do dia como KPI operacional. */
export function isSyncHardFail(u: UnitSnapshot): boolean {
  return !u.sync.offline && u.sync.status === 'error'
}

/** Dados do dia usáveis para alertas operacionais (encaixe, cancel, vagas). */
export function isDayOperable(u: UnitSnapshot): boolean {
  return !u.sync.offline && !isSyncHardFail(u) && isSalonActiveToday(u)
}

/** KPIs semanais/financeiros ainda legíveis com sync parcial ou stale. */
export function trustsRollingKpis(u: UnitSnapshot): boolean {
  if (u.sync.offline) return false
  return u.sync.status === 'ok' || u.sync.status === 'partial' || u.sync.status === 'stale'
}
