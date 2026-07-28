import type { UnitSnapshot } from '@/lib/types'

/** Sync legível para agenda do dia (ok ou atrasado após sucesso). Partial/error não. */
function syncUsableForAgenda(u: UnitSnapshot): boolean {
  if (u.sync.offline) return false
  if (u.sync.status === 'error' || u.sync.status === 'partial') return false
  if (/Aguardando AVEC_API_TOKEN|Sem registro/i.test(u.sync.label)) return false
  return u.sync.status === 'ok' || u.sync.status === 'stale'
}

/** Offline, token morto ou never-sync — caminhos próprios de messaging. */
function isDeadOrAwaiting(u: UnitSnapshot): boolean {
  if (u.sync.offline || isSyncHardFail(u)) return true
  return /Aguardando AVEC_API_TOKEN|Sem registro/i.test(u.sync.label)
}

/**
 * Unidade em operação real no dia.
 * 1 agendamento fantasma (cancel-only / sync parcial) NÃO abre meta/vagas da rede.
 * Never-sync / offline / token morto: não abrir meta/alertas com métricas de cache.
 */
export function isSalonActiveToday(u: UnitSnapshot): boolean {
  if (!isUnitReadable(u)) return false
  if (u.today.revenue > 0 || u.today.attended > 0) return true
  // Agenda sozinha: volume mínimo + sync usável (ok/stale — não partial).
  return syncUsableForAgenda(u) && u.today.appointments >= 3
}

/** Sync quebrado (token) — não tratar zeros do dia como KPI operacional. */
export function isSyncHardFail(u: UnitSnapshot): boolean {
  return !u.sync.offline && u.sync.status === 'error'
}

/**
 * Base conectada mas sem histórico de métricas (ex.: Supabase novo pós-cutover).
 * Não confundir com salão quieto/fechado, nem com awaiting token / never-sync.
 */
export function isMetricsHollow(u: UnitSnapshot): boolean {
  if (isDeadOrAwaiting(u)) return false
  const last30Empty = (u.last30 ?? []).every(
    (d) => d.revenue === 0 && d.attended === 0 && d.appointments === 0,
  )
  return u.mtd.revenue === 0 && u.mtd.attended === 0 && last30Empty
}

/**
 * Unidade legível para totais de rede / painel / export.
 * Offline, token morto, never-sync ou base oca → não soma zeros como real.
 */
export function isUnitReadable(u: UnitSnapshot): boolean {
  if (isDeadOrAwaiting(u)) return false
  if (isMetricsHollow(u)) return false
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
  if (u.sync.offline || isMetricsHollow(u) || isDeadOrAwaiting(u)) return false
  return u.sync.status === 'ok' || u.sync.status === 'partial' || u.sync.status === 'stale'
}
