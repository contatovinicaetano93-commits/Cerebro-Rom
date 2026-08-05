import { buildMockOverview } from '@/lib/mock-overview'
import { fetchLiveUnit, offlineUnitSnapshot } from '@/lib/live/fetch-unit'
import { getUnitConfigs, todayIsoSaoPaulo, UNIT_META } from '@/lib/unit-config'
import { rate, ratio, buildComparison } from '@/lib/comparison'
import { isProduction } from '@/lib/auth'
import { evictSql, withDbTimeout } from '@/lib/db'
import {
  hasTrustedAgenda,
  isDayOperable,
  isMetricsHollow,
  isSalonActiveToday,
  isSyncHardFail,
  isUnitConnected,
  isUnitReadable,
  trustsRollingKpis,
} from '@/lib/salon-day'
import type { AlertItem, CerebroOverview, UnitSnapshot } from '@/lib/types'

/** Uma unidade lenta (rede/pooler) não pode travar o painel inteiro. */
const UNIT_FETCH_TIMEOUT_MS = 22_000

async function fetchUnitBounded(
  config: ReturnType<typeof getUnitConfigs>[number],
  day: string,
): Promise<UnitSnapshot> {
  const url = config.databaseUrl
  if (!url) throw new Error(`Sem DATABASE_URL para ${config.meta.name}`)

  try {
    return await withDbTimeout(
      fetchLiveUnit(config, day),
      UNIT_FETCH_TIMEOUT_MS,
      config.meta.short,
    )
  } catch (err) {
    // Timeout ou erro: evict client max:1 preso — próximo poll não herda hang.
    evictSql(url)
    throw err
  }
}

const SEV = { critical: 0, warning: 1, info: 2 }

/** Famílias de alerta — sync/token antes de ruído de estoque. */
const ACTION_FAMILY_RANK: Record<string, number> = {
  fetch: 0,
  missing: 0,
  'sync-error': 1,
  'sync-partial': 2,
  'sync-stale': 2,
  'partial-units': 2,
  sparse: 3,
  noshow: 4,
  cancel: 4,
  slots: 5,
  'goal-gap': 5,
  'return-missing': 6,
  return: 6,
  rate: 6,
  react: 7,
  'react-cap': 7,
  pay: 8,
  'stock-alert': 9,
  'stock-alerts-missing': 9,
  'stock-drift': 9,
  'goals-unset': 10,
}

function buildTrend30(units: UnitSnapshot[]): CerebroOverview['trend30'] {
  // Offline / hard-fail → null (gap). Alinha com consolidate / scorecard.
  const brasilLive = units.find((u) => u.unit.slug === 'rom-brasil' && isUnitReadable(u))
  const iguatemiLive = units.find((u) => u.unit.slug === 'rom-iguatemi' && isUnitReadable(u))
  // revenue is number|null; treat null (unsynced) as 0 for the trend chart.
  const brasilByDay = new Map(
    brasilLive?.last30.map((d) => [d.day, d.revenue ?? 0]) ?? [],
  )
  const iguatemiByDay = new Map(
    iguatemiLive?.last30.map((d) => [d.day, d.revenue ?? 0]) ?? [],
  )
  const allDays = [...new Set([...brasilByDay.keys(), ...iguatemiByDay.keys()])].sort()

  if (allDays.length === 0) {
    const days = brasilLive?.last30 ?? iguatemiLive?.last30 ?? []
    return days.map((row, idx) => ({
      day: row.day.slice(5),
      brasil: brasilLive ? (brasilLive.last30[idx]?.revenue ?? 0) : null,
      iguatemi: iguatemiLive ? (iguatemiLive.last30[idx]?.revenue ?? 0) : null,
    }))
  }

  return allDays.map((day) => ({
    day: day.slice(5),
    // Não legível → null (gap no gráfico). Legível sem dia → 0 (fechado/sem movimento).
    brasil: brasilLive ? (brasilByDay.get(day) ?? 0) : null,
    iguatemi: iguatemiLive ? (iguatemiByDay.get(day) ?? 0) : null,
  }))
}

/** Uma lista só: o que o Waltter deve fazer agora. */
function buildNextActions(units: UnitSnapshot[], goalsConfigured: boolean): AlertItem[] {
  const actions: AlertItem[] = []

  if (!goalsConfigured) {
    actions.push({
      id: 'goals-unset',
      severity: 'info',
      unit: 'both',
      title: 'Metas ainda não definidas',
      detail: 'Preencha meta diária e capacidade de cada unidade no painel.',
      action: 'Abrir Metas → salvar Brasil e Iguatemi',
    })
  }

  for (const u of units) {
    if (u.sync.status === 'error') {
      const tokenish = /token|AVEC_API_TOKEN|expirado|refresh/i.test(u.sync.label)
      actions.push({
        id: `sync-error-${u.unit.slug}`,
        severity: 'critical',
        unit: u.unit.slug,
        title: `Sync com erro — ${u.unit.short}`,
        detail: u.sync.label,
        action: tokenish
          ? 'ROM Admin → refresh token Avec (force) + sync full'
          : 'Ver logs Avec na unidade e rerodar sync',
      })
    } else if (u.sync.status === 'partial') {
      actions.push({
        id: `sync-partial-${u.unit.slug}`,
        severity: 'warning',
        unit: u.unit.slug,
        title: `Sync parcial — ${u.unit.short}`,
        detail: u.sync.label,
        action: 'Completar sync / reprocessar etapas que falharam',
      })
    } else if (u.sync.status === 'stale') {
      const awaiting = /Aguardando AVEC_API_TOKEN|Sem registro/i.test(u.sync.label)
      actions.push({
        id: `sync-stale-${u.unit.slug}`,
        severity: awaiting ? 'info' : 'warning',
        unit: u.unit.slug,
        title: awaiting
          ? `Aguardando token — ${u.unit.short}`
          : `Sync atrasado — ${u.unit.short}`,
        detail: u.sync.label,
        action: awaiting
          ? 'Colar AVEC_API_TOKEN na Vercel → sync full'
          : 'Rodar sync ou validar cron',
      })
    }

    if (isMetricsHollow(u)) {
      actions.push({
        id: `sparse-${u.unit.slug}`,
        severity: 'warning',
        unit: u.unit.slug,
        title: `Base sem métricas — ${u.unit.short}`,
        detail:
          'DB conectado, mas sem histórico de faturamento/atendidos (MTD + 30d). Típico pós-cutover ou sync sem popular salon_daily_metrics.',
        action: 'Rodar sync full Avec na unidade e validar schema/migrations',
      })
    }

    const dayOk = isDayOperable(u)
    const todayNoShows = u.today.noShows ?? 0
    const todayCancelled = u.today.cancelled ?? 0
    const todayTicketAvg = u.today.ticketAvg ?? 0
    if (dayOk && todayNoShows > 0) {
      const risk =
        todayTicketAvg > 0
          ? ` · risco ~R$ ${Math.round(todayNoShows * todayTicketAvg)}`
          : ' · ticket ainda indisponível'
      actions.push({
        id: `noshow-${u.unit.slug}`,
        severity: todayNoShows >= 3 ? 'critical' : 'warning',
        unit: u.unit.slug,
        title: `No-show — ${u.unit.short}`,
        detail: `${todayNoShows} hoje${risk}`,
        action: 'Remarcar + confirmação WhatsApp',
      })
    }

    if (dayOk && todayCancelled > 0) {
      actions.push({
        id: `cancel-${u.unit.slug}`,
        severity: todayCancelled >= 3 ? 'warning' : 'info',
        unit: u.unit.slug,
        title: `Cancelamentos — ${u.unit.short}`,
        detail: `${todayCancelled} hoje`,
        action: 'Encaixe na lista de espera',
      })
    }

    // Vagas 2h: exige CS live confiável (não inventar livres com metrics-only).
    if (
      dayOk &&
      hasTrustedAgenda(u) &&
      u.opsToday.slotsNext2hKnown &&
      u.opsToday.openSlotsNext2h >= 2
    ) {
      actions.push({
        id: `slots-${u.unit.slug}`,
        severity: 'info',
        unit: u.unit.slug,
        title: `Vagas nas 2h — ${u.unit.short}`,
        detail: `${u.opsToday.openSlotsNext2h} livres`,
        action: 'Campanha rápida de encaixe',
      })
    }

    const rolling = trustsRollingKpis(u)
    // 5.000+ = teto Avec — útil como info, não como “reativar 5000”.
    if (rolling && u.opsWeek.reactivationCount != null && u.opsWeek.reactivationCount >= 5000) {
      actions.push({
        id: `react-cap-${u.unit.slug}`,
        severity: 'info',
        unit: u.unit.slug,
        title: `Sem retorno (lista cheia) — ${u.unit.short}`,
        detail: '5.000+ sem retorno (90d) · paginação Avec truncada',
        action: 'Tratar lista no ROM Contatos / campanha',
      })
    } else if (
      rolling &&
      u.opsWeek.reactivationCount != null &&
      u.opsWeek.reactivationCount >= 50
    ) {
      actions.push({
        id: `react-${u.unit.slug}`,
        severity: 'info',
        unit: u.unit.slug,
        title: `Sem retorno — ${u.unit.short}`,
        detail: `${u.opsWeek.reactivationCount} sem retorno (90d)`,
        action: 'Lista WhatsApp / campanha de retorno',
      })
    }

    if (rolling && u.opsWeek.returnRate != null && u.opsWeek.returnRate > 0 && u.opsWeek.returnRate < 0.45) {
      actions.push({
        id: `return-${u.unit.slug}`,
        severity: 'warning',
        unit: u.unit.slug,
        title: `Retorno baixo — ${u.unit.short}`,
        detail: `${Math.round(u.opsWeek.returnRate * 100)}%`,
        action: 'Reforçar pós-atendimento',
      })
    } else if (rolling && u.opsWeek.returnRate == null) {
      actions.push({
        id: `return-missing-${u.unit.slug}`,
        severity: 'warning',
        unit: u.unit.slug,
        title: `Retorno ausente — ${u.unit.short}`,
        detail: 'salon_p3_daily.return_rate vazio (sync P3/full)',
        action: 'ROM → sync full / popular P3 retorno',
      })
    }

    if (rolling && u.opsCommerce.ratingsCount > 0 && u.opsCommerce.ratingsAvg < 4.2) {
      actions.push({
        id: `rate-${u.unit.slug}`,
        severity: 'warning',
        unit: u.unit.slug,
        title: `Nota baixa — ${u.unit.short}`,
        detail: `${u.opsCommerce.ratingsAvg.toFixed(1)} (${u.opsCommerce.ratingsCount})`,
        action: 'Revisar experiência',
      })
    }

    if (rolling && u.opsFinance.paymentReconcile === 'divergent') {
      const gap = u.opsFinance.paymentGap
      const gapLabel =
        gap == null ? 'gap desconhecido' : `gap R$ ${Math.round(gap).toLocaleString('pt-BR')}`
      actions.push({
        id: `pay-${u.unit.slug}`,
        severity: 'warning',
        unit: u.unit.slug,
        title: `Conciliação 0081 — ${u.unit.short}`,
        detail: `${gapLabel} · pagamentos ${Math.round(u.opsFinance.paymentsTotal).toLocaleString('pt-BR')} vs receita nos mesmos dias`,
        action: 'Conferir sync Avec 0081 no ROM',
      })
    }

    // Centenas/milhares de alertas = higiene de catálogo, não crise operacional.
    if (rolling && u.opsStock.available && u.opsStock.alertsKnown && u.opsStock.activeAlerts >= 50) {
      actions.push({
        id: `stock-alert-${u.unit.slug}`,
        severity: 'info',
        unit: u.unit.slug,
        title:
          u.opsStock.activeAlerts >= 200
            ? `Estoque: muitos alertas — ${u.unit.short}`
            : `Estoque baixo — ${u.unit.short}`,
        detail: `${u.opsStock.activeAlerts} alertas · ${u.opsStock.zeroProducts} zerados`,
        action:
          u.opsStock.activeAlerts >= 200
            ? 'Revisar critérios de alerta no ROM Estoque'
            : 'Fila de compra no ROM Estoque',
      })
    } else if (rolling && u.opsStock.available && !u.opsStock.alertsKnown) {
      // IG: stock_alerts vazia mas milhares de SKUs zerados — gap de sync, não “estoque ok”.
      actions.push({
        id: `stock-alerts-missing-${u.unit.slug}`,
        severity: 'warning',
        unit: u.unit.slug,
        title: `Alertas estoque ausentes — ${u.unit.short}`,
        detail: `${u.opsStock.zeroProducts} SKUs zerados · sync de alertas Avec vazio`,
        action: 'ROM Estoque → sync alertas / 0149',
      })
    }

    if (rolling && u.opsStock.available && u.opsStock.drift != null && Math.abs(u.opsStock.drift) > 50) {
      actions.push({
        id: `stock-drift-${u.unit.slug}`,
        severity: 'info',
        unit: u.unit.slug,
        title: `Drift estoque — ${u.unit.short}`,
        detail: `Diferença de R$ ${Math.round(Math.abs(u.opsStock.drift))} vs Avec 0045`,
        action: 'Rodar sync estoque full',
      })
    }
  }

  // Meta do dia: só unidades com faturamento/atendido (não agenda sem dinheiro).
  const moneyActive = units.filter(
    (u) => isSalonActiveToday(u) && ((u.today.revenue ?? 0) > 0 || (u.today.attended ?? 0) > 0),
  )
  if (moneyActive.length > 0 && moneyActive.every((u) => u.today.goalSet)) {
    const activeGoal = moneyActive.reduce((a, u) => a + u.today.dailyGoal, 0)
    const activeRevenue = moneyActive.reduce((a, u) => a + (u.today.revenue ?? 0), 0)
    const gap = Math.max(0, activeGoal - activeRevenue)
    if (gap > 500) {
      const who =
        moneyActive.length === 1 ? moneyActive[0]!.unit.slug : ('both' as const)
      actions.push({
        id: 'goal-gap',
        severity: 'info',
        unit: who,
        title:
          moneyActive.length === 1
            ? `Meta do dia em aberto — ${moneyActive[0]!.unit.short}`
            : 'Meta do dia em aberto',
        detail: `Faltam R$ ${Math.round(gap).toLocaleString('pt-BR')} (só unidades com faturamento)`,
        action: 'Vagas + upsell nos restantes',
      })
    }
  }

  return sortNextActions(actions)
}

/** Severidade → prioridade de família → unidade — sem cortar a lista. */
function sortNextActions(actions: AlertItem[]): AlertItem[] {
  const unitOrder = (unit: AlertItem['unit']) => {
    if (unit === 'rom-brasil') return 0
    if (unit === 'rom-iguatemi') return 1
    return 2
  }
  const family = (id: string) => id.replace(/-(rom-brasil|rom-iguatemi|both)$/i, '')
  const familyRank = (id: string) => ACTION_FAMILY_RANK[family(id)] ?? 50

  return [...actions].sort((a, b) => {
    const bySev = SEV[a.severity] - SEV[b.severity]
    if (bySev !== 0) return bySev
    const byRank = familyRank(a.id) - familyRank(b.id)
    if (byRank !== 0) return byRank
    const byFam = family(a.id).localeCompare(family(b.id), 'pt-BR')
    if (byFam !== 0) return byFam
    return unitOrder(a.unit) - unitOrder(b.unit)
  })
}

function consolidate(units: UnitSnapshot[]): CerebroOverview['consolidated'] {
  /** Totais de caixa/MTD: só unidades com métricas diárias confiáveis. */
  const readable = units.filter(isUnitReadable)
  /** CMV/estoque/metas config: unidade no ar basta (não exige MTD hollow-free). */
  const connected = units.filter((u) => isUnitConnected(u) && trustsRollingKpis(u))
  const active = units.filter(isSalonActiveToday)
  /** Meta do dia: unidades com movimento. */
  const dayOps = active
  /** % meta / gap: só com receita ou atendido (não agenda sem dinheiro). */
  const moneyOps = dayOps.filter((u) => (u.today.revenue ?? 0) > 0 || (u.today.attended ?? 0) > 0)
  /** Ocupação/vagas: só com agenda confiável (não capacity cheia pós-wipe parcial). */
  const agendaOps = dayOps.filter(hasTrustedAgenda)

  const todayRevenue = readable.reduce((a, u) => a + (u.today.revenue ?? 0), 0)
  const todayGoal = moneyOps.reduce((a, u) => a + (u.today.goalSet ? u.today.dailyGoal : 0), 0)
  const goalsConfigured =
    connected.length > 0 && connected.every((u) => u.today.goalSet && u.today.capacitySet)
  const mtdRevenueUnits = readable.filter((u) => u.mtd.revenue != null)
  const mtdAttendedUnits = readable.filter((u) => u.mtd.attended != null)
  const mtdRevenue =
    mtdRevenueUnits.length > 0
      ? mtdRevenueUnits.reduce((a, u) => a + (u.mtd.revenue ?? 0), 0)
      : null
  const mtdAttended =
    mtdAttendedUnits.length > 0
      ? mtdAttendedUnits.reduce((a, u) => a + (u.mtd.attended ?? 0), 0)
      : 0
  const mtdGoal = readable.reduce((a, u) => a + (u.mtd.goalSet ? u.mtd.goal : 0), 0)
  const attended = agendaOps.reduce((a, u) => a + (u.today.attended ?? 0), 0)
  const appointments = agendaOps.reduce((a, u) => a + (u.today.appointments ?? 0), 0)
  const noShows = agendaOps.reduce((a, u) => a + (u.today.noShows ?? 0), 0)
  /** Ocupação: só unidades com capacidade definida (não all-or-nothing). */
  const capacityOps = agendaOps.filter((u) => u.today.capacitySet)
  const slots2hOps = capacityOps.filter((u) => u.opsToday.slotsNext2hKnown)
  const capacity = capacityOps.reduce((a, u) => a + u.today.capacity, 0)
  const capacityAppointments = capacityOps.reduce((a, u) => a + (u.today.appointments ?? 0), 0)
  const occupancyConfigured = capacityOps.length > 0 && capacity > 0
  const attendanceConfigured = appointments > 0
  const newClients = moneyOps.reduce((a, u) => a + (u.today.newClients ?? 0), 0)
  const returningClients = moneyOps.reduce((a, u) => a + (u.today.returningClients ?? 0), 0)
  const leads = moneyOps.reduce((a, u) => a + u.today.leads, 0)
  const converted = moneyOps.reduce((a, u) => a + u.today.converted, 0)
  const mixBase = newClients + returningClients
  const cmvKnownUnits = connected.filter((u) => u.opsFinance.cmvKnown)
  const cmv = cmvKnownUnits.reduce((a, u) => a + u.opsFinance.cmv, 0)
  const cmvMtd = cmvKnownUnits.reduce((a, u) => a + (u.opsFinance.mtdRevenue ?? 0), 0)
  const stockValue = connected.reduce(
    (a, u) => a + (u.opsStock.valueKnown ? u.opsStock.totalValue : 0),
    0,
  )
  const stockUnits = connected.filter((u) => u.opsStock.available)
  const stockAlerts = stockUnits.reduce(
    (a, u) => a + (u.opsStock.alertsKnown ? u.opsStock.activeAlerts : 0),
    0,
  )
  const stockKnown = stockUnits.length > 0
  // Todas as unidades com estoque precisam ter alertas conhecidos — senão 0 = mentira.
  const stockAlertsKnown =
    stockUnits.length > 0 && stockUnits.every((u) => u.opsStock.alertsKnown)
  const stockValueKnown = connected.some((u) => u.opsStock.valueKnown)
  const dayRevenue = moneyOps.reduce((a, u) => a + (u.today.revenue ?? 0), 0)
  const agendaRevenue = agendaOps.reduce((a, u) => a + (u.today.revenue ?? 0), 0)

  let revenueAtRisk: number | null = 0
  let riskHasUnknown = false
  let riskHasKnown = false
  for (const u of agendaOps) {
    if ((u.today.noShows ?? 0) <= 0) continue
    if ((u.today.ticketAvg ?? 0) <= 0) {
      riskHasUnknown = true
      continue
    }
    riskHasKnown = true
    revenueAtRisk = (revenueAtRisk ?? 0) + (u.today.noShows ?? 0) * (u.today.ticketAvg ?? 0)
  }
  // Qualquer no-show sem ticket → risco desconhecido (não apresentar soma parcial como total).
  if (riskHasUnknown) revenueAtRisk = null
  else if (!riskHasKnown) revenueAtRisk = 0

  return {
    todayRevenue,
    todayGoal,
    todayGoalProgress:
      moneyOps.length > 0 && moneyOps.every((u) => u.today.goalSet) && todayGoal > 0
        ? rate(dayRevenue, todayGoal)
        : 0,
    goalsConfigured,
    todayOpsActive: dayOps.length > 0,
    todayMoneyActive: moneyOps.length > 0,
    mtdRevenue,
    mtdGoal,
    mtdGoalProgress:
      mtdRevenue != null && readable.length > 0 && goalsConfigured && mtdGoal > 0
        ? rate(mtdRevenue, mtdGoal)
        : 0,
    mtdTicketAvg:
      mtdRevenue != null && mtdAttended > 0 ? Math.round(mtdRevenue / mtdAttended) : null,
    attendanceRate: rate(attended, appointments),
    noShowRate: rate(noShows, appointments),
    occupancyRate: occupancyConfigured ? ratio(capacityAppointments, capacity) : 0,
    occupancyConfigured,
    attendanceConfigured,
    // Ticket do dia: só unidades com agenda confiável (não misturar receita órfã).
    ticketAvg: attended > 0 ? Math.round(agendaRevenue / attended) : 0,
    revenueAtRisk,
    newClients,
    returningClients,
    conversionRate: rate(converted, leads),
    openSlotsToday: capacityOps.reduce((a, u) => a + u.opsToday.openSlotsToday, 0),
    openSlotsNext2h: slots2hOps.reduce((a, u) => a + u.opsToday.openSlotsNext2h, 0),
    slotsNext2hConfigured: slots2hOps.length > 0,
    cancelledToday: dayOps.reduce((a, u) => a + (u.today.cancelled ?? 0), 0),
    noShowsToday: dayOps.reduce((a, u) => a + (u.today.noShows ?? 0), 0),
    newShare: mixBase > 0 ? newClients / mixBase : 0,
    cmv,
    cmvKnown: cmvKnownUnits.length > 0,
    cmvShare: cmvKnownUnits.length > 0 && cmvMtd > 0 ? cmv / cmvMtd : null,
    stockValue,
    stockAlerts,
    stockKnown,
    stockAlertsKnown,
    stockValueKnown,
    networkReadable: readable.length > 0,
  }
}

function emptyConsolidated(): CerebroOverview['consolidated'] {
  return {
    todayRevenue: 0,
    todayGoal: 0,
    todayGoalProgress: 0,
    goalsConfigured: false,
    todayOpsActive: false,
    todayMoneyActive: false,
    mtdRevenue: null,
    mtdGoal: 0,
    mtdGoalProgress: 0,
    mtdTicketAvg: null,
    attendanceRate: 0,
    noShowRate: 0,
    occupancyRate: 0,
    occupancyConfigured: false,
    attendanceConfigured: false,
    ticketAvg: 0,
    revenueAtRisk: null,
    newClients: 0,
    returningClients: 0,
    conversionRate: 0,
    openSlotsToday: 0,
    openSlotsNext2h: 0,
    slotsNext2hConfigured: false,
    cancelledToday: 0,
    noShowsToday: 0,
    newShare: 0,
    cmv: 0,
    cmvKnown: false,
    cmvShare: null,
    stockValue: 0,
    stockAlerts: 0,
    stockKnown: false,
    stockAlertsKnown: false,
    stockValueKnown: false,
    networkReadable: false,
  }
}

function degradedOverview(
  detail: string,
  action: string,
  alertId = 'live-degraded',
): CerebroOverview {
  return {
    generatedAt: new Date().toISOString(),
    mode: 'degraded',
    partial: true,
    periodLabel: `Degradado · ${todayIsoSaoPaulo()}`,
    consolidated: emptyConsolidated(),
    units: [],
    trend30: [],
    nextActions: [
      {
        id: alertId,
        severity: 'critical',
        unit: 'both',
        title: 'Live indisponível',
        detail,
        action,
      },
    ],
  }
}

export async function buildLiveOverview(asOf?: string): Promise<CerebroOverview> {
  const configs = getUnitConfigs()
  const configured = configs.filter((c) => c.databaseUrl)
  if (configured.length === 0) {
    throw new Error('Nenhuma DATABASE_URL de unidade configurada (BR/IG = pooler Supabase)')
  }

  const day = asOf ?? todayIsoSaoPaulo()
  const isHistorical = day < todayIsoSaoPaulo()

  const settled = await Promise.allSettled(configured.map((c) => fetchUnitBounded(c, day)))
  const liveBySlug = new Map<string, UnitSnapshot>()
  const fetchErrors: AlertItem[] = []

  settled.forEach((result, idx) => {
    const cfg = configured[idx]!
    if (result.status === 'fulfilled') {
      liveBySlug.set(cfg.meta.slug, result.value)
    } else {
      const detail = String(result.reason?.message ?? result.reason)
      const schemaGap = /schema incompleto|does not exist|undefined_table|salon_daily_metrics/i.test(
        detail,
      )
      fetchErrors.push({
        id: `fetch-${cfg.meta.slug}`,
        severity: 'critical',
        unit: cfg.meta.slug,
        title: schemaGap
          ? `Schema incompleto — ${cfg.meta.name}`
          : `DB offline — ${cfg.meta.name}`,
        detail,
        action: schemaGap
          ? 'Rodar migrations / schema.sql na unidade (Supabase)'
          : 'Validar connection string (pooler Supabase)',
      })
      liveBySlug.set(
        cfg.meta.slug,
        offlineUnitSnapshot(
          cfg.meta,
          `${schemaGap ? 'Schema' : 'Offline'} — ${detail.slice(0, 80)}`,
          day,
        ),
      )
    }
  })

  // Sempre Brasil + Iguatemi no painel (mesmo slot, mesmos campos).
  for (const cfg of configs) {
    if (liveBySlug.has(cfg.meta.slug)) continue
    const detail = cfg.databaseUrl
      ? 'Sem resposta'
      : cfg.meta.slug === 'rom-brasil'
        ? 'URL Brasil ausente ou inválida (use pooler Supabase)'
        : 'URL Iguatemi ausente ou inválida (use pooler Supabase)'
    fetchErrors.push({
      id: `missing-${cfg.meta.slug}`,
      severity: 'critical',
      unit: cfg.meta.slug,
      title: `Unidade ausente — ${cfg.meta.name}`,
      detail,
      action:
        cfg.meta.slug === 'rom-brasil'
          ? 'UNIT_BRASIL_DATABASE_URL (ou NEON_BRASIL_DATABASE_URL legado) = pooler Supabase'
          : 'UNIT_IGUATEMI_DATABASE_URL (ou NEON_IGUATEMI_DATABASE_URL legado) = pooler Supabase',
    })
    liveBySlug.set(cfg.meta.slug, offlineUnitSnapshot(cfg.meta, detail, day))
  }

  const units = [UNIT_META['rom-brasil'], UNIT_META['rom-iguatemi']].map(
    (meta) => liveBySlug.get(meta.slug) ?? offlineUnitSnapshot(meta, 'Sem dados', day),
  )

  const liveUnits = units.filter((u) => !u.sync.offline)
  // Outage total: NÃO throw — preserva snapshots offline + fetchErrors já montados.
  const consolidated =
    liveUnits.length > 0 ? consolidate(liveUnits) : emptyConsolidated()
  // Trend recebe todas (offline/hard-fail → null na série — não zero falso).
  const trend30 = buildTrend30(units)

  const nextActions = [
    ...fetchErrors,
    ...buildNextActions(liveUnits, consolidated.goalsConfigured),
  ]
  if (liveUnits.length === 0) {
    nextActions.unshift({
      id: 'all-units-offline',
      severity: 'critical',
      unit: 'both',
      title: 'Nenhuma unidade live respondeu',
      detail: 'Brasil e Iguatemi offline ou ilegíveis — painel mostra diagnóstico por unidade',
      action: 'Validar connection strings (pooler Supabase) e schema das duas unidades',
    })
  } else if (liveUnits.length < 2) {
    nextActions.unshift({
      id: 'partial-units',
      severity: 'warning',
      unit: 'both',
      title: 'Consolidado parcial',
      detail: `Só ${liveUnits[0]?.unit.short ?? 'uma unidade'} ao vivo — a outra está no painel como offline`,
      action: 'Completar DATABASE_URL (Brasil+Iguatemi = pooler Supabase)',
    })
  }

  const syncHardFail = units.some(isSyncHardFail)
  const syncPartial = units.some((u) => !u.sync.offline && u.sync.status === 'partial')
  const syncStale = units.some((u) => !u.sync.offline && u.sync.status === 'stale')
  const unreadable = units.some((u) => !isUnitReadable(u))
  // hollow já entra em unreadable; flag só para rótulo do período.
  const hollowMetrics = units.some((u) => isMetricsHollow(u))
  const partial =
    liveUnits.length < 2 ||
    fetchErrors.length > 0 ||
    syncHardFail ||
    syncPartial ||
    syncStale ||
    unreadable

  const histNote = isHistorical
    ? ' · MTD até a data · estoque omitido · ranking ≤ data'
    : ''
  const allOffline = liveUnits.length === 0
  return {
    generatedAt: new Date().toISOString(),
    mode: allOffline ? 'degraded' : 'live',
    partial,
    periodLabel: allOffline
      ? `Degradado · nenhuma unidade live · ${day}${histNote}`
      : partial
        ? syncHardFail
          ? `Live parcial · sync com erro · ${day}${histNote}`
          : syncPartial
            ? `Live parcial · sync incompleto · ${day}${histNote}`
            : syncStale
              ? `Live parcial · sync desatualizado · ${day}${histNote}`
              : hollowMetrics
                ? `Live parcial · base sem métricas · ${day}${histNote}`
                : unreadable
                  ? `Live parcial · unidade ilegível · ${day}${histNote}`
                  : `Live parcial · ${day}${histNote}`
        : `Live · ${day}${histNote}`,
    consolidated,
    units,
    trend30,
    nextActions: sortNextActions(nextActions),
    comparison: buildComparison(units),
  }
}

export async function buildOverview(asOf?: string): Promise<CerebroOverview> {
  const hasDb = getUnitConfigs().some((c) => c.databaseUrl)
  const forceMock = process.env.CEREBRO_FORCE_MOCK === '1'
  const isProd = isProduction()

  if (forceMock && !isProd) {
    return buildMockOverview()
  }

  if (!hasDb) {
    if (isProd) {
      return {
        ...degradedOverview(
          'DATABASE_URL das unidades ausente em produção (Brasil+Iguatemi = Supabase)',
          'Configurar UNIT_BRASIL/IGUATEMI_DATABASE_URL (ou NEON_* legado) = pooler Supabase na Vercel',
          'no-unit-db',
        ),
        nextActions: [
          {
            id: 'no-unit-db',
            severity: 'critical',
            unit: 'both',
            title: 'DBs das unidades não configurados',
            detail: 'Connection strings ausentes ou inválidas (Brasil+Iguatemi = Supabase)',
            action: 'Configurar URLs na Vercel (Brasil+Iguatemi=pooler Supabase)',
          },
        ],
      }
    }
    return buildMockOverview()
  }

  try {
    return await buildLiveOverview(asOf)
  } catch (err) {
    return degradedOverview(
      String(err instanceof Error ? err.message : err),
      'Checar connection strings e reiniciar',
    )
  }
}
