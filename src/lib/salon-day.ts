import type { UnitSnapshot } from '@/lib/types'

/**
 * Unidade em operação real no dia.
 * 1 agendamento fantasma (cancel-only / sync parcial) NÃO abre meta/vagas da rede.
 */
export function isSalonActiveToday(u: UnitSnapshot): boolean {
  if (u.today.revenue > 0 || u.today.attended > 0) return true
  // Agenda sozinha: precisa de volume mínimo E sync ok (senão é ruído).
  return u.sync.status === 'ok' && u.today.appointments >= 3
}

/** Sync quebrado (token) — não tratar zeros do dia como KPI operacional. */
export function isSyncHardFail(u: UnitSnapshot): boolean {
  return !u.sync.offline && u.sync.status === 'error'
}

/** Dados do dia usáveis para alertas operacionais (encaixe, cancel, vagas). */
export function isDayOperable(u: UnitSnapshot): boolean {
  return !u.sync.offline && !isSyncHardFail(u) && isSalonActiveToday(u)
}

/**
 * Agenda confiável para ocupação/vagas.
 * Evita capacity cheia com sync parcial ou 1 linha fantasma.
 */
export function hasTrustedAgenda(u: UnitSnapshot): boolean {
  if (u.sync.offline || !isSalonActiveToday(u)) return false
  if (u.today.attended > 0) return true
  if (u.today.appointments >= 3) return true
  // Receita sem agenda listada: só com sync ok (não inventar vagas).
  if (u.today.revenue > 0) return u.sync.status === 'ok' && u.today.appointments > 0
  return u.sync.status === 'ok' && u.today.appointments > 0
}

/** KPIs semanais/financeiros ainda legíveis com sync parcial ou stale. */
export function trustsRollingKpis(u: UnitSnapshot): boolean {
  if (u.sync.offline) return false
  return u.sync.status === 'ok' || u.sync.status === 'partial' || u.sync.status === 'stale'
}
