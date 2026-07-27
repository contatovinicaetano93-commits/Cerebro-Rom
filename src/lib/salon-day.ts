import type { UnitSnapshot } from '@/lib/types'

/** Sync legível para agenda do dia (ok ou atrasado após sucesso). Partial/error não. */
function syncUsableForAgenda(u: UnitSnapshot): boolean {
  if (u.sync.offline) return false
  if (u.sync.status === 'error' || u.sync.status === 'partial') return false
  if (/Aguardando AVEC_API_TOKEN|Sem registro/i.test(u.sync.label)) return false
  return u.sync.status === 'ok' || u.sync.status === 'stale'
}

/**
 * Unidade em operação real no dia.
 * 1 agendamento fantasma (cancel-only / sync parcial) NÃO abre meta/vagas da rede.
 */
export function isSalonActiveToday(u: UnitSnapshot): boolean {
  if (u.sync.offline || isSyncHardFail(u)) return false
  if (u.today.revenue > 0 || u.today.attended > 0) return true
  // Agenda sozinha: volume mínimo + sync usável (ok/stale — não partial).
  return syncUsableForAgenda(u) && u.today.appointments >= 3
}

/** Sync quebrado (token) — não tratar zeros do dia como KPI operacional. */
export function isSyncHardFail(u: UnitSnapshot): boolean {
  return !u.sync.offline && u.sync.status === 'error'
}

/**
 * Unidade legível para totais de rede / painel / export.
 * Offline, token morto ou jamais sincronizado → não soma zeros como dinheiro real.
 */
export function isUnitReadable(u: UnitSnapshot): boolean {
  if (u.sync.offline || isSyncHardFail(u)) return false
  if (/Aguardando AVEC_API_TOKEN|Sem registro/i.test(u.sync.label)) return false
  return true
}

/** Dados do dia usáveis para alertas operacionais (encaixe, cancel, vagas). */
export function isDayOperable(u: UnitSnapshot): boolean {
  return !u.sync.offline && !isSyncHardFail(u) && isSalonActiveToday(u)
}

/**
 * Agenda confiável para ocupação/vagas.
 * Exige sync ok|stale — partial não inventa capacity/encaixe.
 */
export function hasTrustedAgenda(u: UnitSnapshot): boolean {
  if (u.sync.offline || !isSalonActiveToday(u) || !syncUsableForAgenda(u)) return false
  if (u.today.attended > 0 || u.today.appointments >= 3) return true
  return u.today.appointments > 0
}

/** KPIs semanais/financeiros ainda legíveis com sync parcial ou stale. */
export function trustsRollingKpis(u: UnitSnapshot): boolean {
  if (u.sync.offline) return false
  return u.sync.status === 'ok' || u.sync.status === 'partial' || u.sync.status === 'stale'
}
