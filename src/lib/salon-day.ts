import type { UnitSnapshot } from '@/lib/types'

/** Sync legível para agenda do dia (ok, atrasado ou parcial com dados usáveis). */
function syncUsableForAgenda(u: UnitSnapshot): boolean {
  if (u.sync.offline) return false
  if (u.sync.status === 'error') return false
  if (/Aguardando AVEC_API_TOKEN|Sem registro/i.test(u.sync.label)) return false
  return u.sync.status === 'ok' || u.sync.status === 'stale' || u.sync.status === 'partial'
}

/** Offline, token morto ou never-sync — caminhos próprios de messaging. */
function isDeadOrAwaiting(u: UnitSnapshot): boolean {
  if (u.sync.offline || isSyncHardFail(u)) return true
  return /Aguardando AVEC_API_TOKEN|Sem registro/i.test(u.sync.label)
}

/** Sync quebrado (token) — não tratar zeros do dia como KPI operacional. */
export function isSyncHardFail(u: UnitSnapshot): boolean {
  return !u.sync.offline && u.sync.status === 'error'
}

/**
 * Base conectada mas sem histórico de métricas diárias (ex.: cutover).
 * Não bloqueia semana/financeiro/estoque se essas camadas tiverem dado.
 */
export function isMetricsHollow(u: UnitSnapshot): boolean {
  if (isDeadOrAwaiting(u)) return false
  const last30Empty = (u.last30 ?? []).every(
    (d) => d.revenue === 0 && d.attended === 0 && d.appointments === 0,
  )
  return u.mtd.revenue === 0 && u.mtd.attended === 0 && last30Empty
}

/**
 * Unidade no ar (DB ok) — serve para pares Semana/Comercial/Financeiro/Estoque.
 * Diferente de isUnitReadable (métricas do dia/MTD).
 */
export function isUnitConnected(u: UnitSnapshot): boolean {
  return !isDeadOrAwaiting(u)
}

/**
 * Métricas diárias/MTD confiáveis para totais de rede e tendência.
 * Offline, token morto, never-sync ou base oca → não soma R$0 fantasma.
 */
export function isUnitReadable(u: UnitSnapshot): boolean {
  if (!isUnitConnected(u)) return false
  if (isMetricsHollow(u)) return false
  return true
}

/**
 * Unidade em operação real no dia.
 * 1 agendamento fantasma NÃO abre meta/vagas da rede.
 */
export function isSalonActiveToday(u: UnitSnapshot): boolean {
  if (!isUnitReadable(u)) return false
  if (u.today.revenue > 0 || u.today.attended > 0) return true
  return syncUsableForAgenda(u) && u.today.appointments >= 3
}

/** KPIs rolling (semana/finance/estoque) com sync ok|partial|stale. */
export function trustsRollingKpis(u: UnitSnapshot): boolean {
  if (!isUnitConnected(u)) return false
  return u.sync.status === 'ok' || u.sync.status === 'partial' || u.sync.status === 'stale'
}

/** Dados do dia usáveis para alertas operacionais (encaixe, cancel, vagas). */
export function isDayOperable(u: UnitSnapshot): boolean {
  return isSalonActiveToday(u)
}

/**
 * Agenda confiável para ocupação/vagas.
 * Exige sync ok|stale — partial não inventa capacity/encaixe
 * (isSalonActiveToday ainda aceita partial para não zerar o dia).
 */
export function hasTrustedAgenda(u: UnitSnapshot): boolean {
  if (!isSalonActiveToday(u) || !syncUsableForAgenda(u)) return false
  if (u.sync.status === 'partial') return false
  if (u.today.attended > 0 || u.today.appointments >= 3) return true
  return u.today.appointments > 0
}
