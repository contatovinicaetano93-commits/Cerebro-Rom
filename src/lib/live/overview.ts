import { buildMockOverview } from '@/lib/mock-overview'
import { fetchLiveUnit, offlineUnitSnapshot } from '@/lib/live/fetch-unit'
import { getUnitConfigs, todayIsoSaoPaulo, UNIT_META } from '@/lib/unit-config'
import { rate, buildComparison } from '@/lib/comparison'
import { isProduction } from '@/lib/auth'
import {
  hasTrustedAgenda,
  isDayOperable,
  isSalonActiveToday,
  isSyncHardFail,
  trustsRollingKpis,
} from '@/lib/salon-day'
import type { AlertItem, CerebroOverview, UnitSnapshot } from '@/lib/types'

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
  return: 6,
  rate: 6,
  react: 7,
  'react-cap': 7,
  pay: 8,
  'stock-alert': 9,
  'stock-drift': 9,
  'goals-unset': 10,
}

function buildTrend30(units: UnitSnapshot[]): CerebroOverview['trend30'] {
  const brasilLive = units.find((u) => u.unit.slug === 'rom-brasil' && !u.sync.offline)
  const iguatemiLive = units.find((u) => u.unit.slug === 'rom-iguatemi' && !u.sync.offline)
  const brasilByDay = new Map(brasilLive?.last30.map((d) => [d.day, d.revenue]) ?? [])
  const iguatemiByDay = new Map(iguatemiLive?.last30.map((d) => [d.day, d.revenue]) ?? [])
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
    // Offline → null (gap no gráfico). Live sem dia → 0 (fechado/sem movimento).
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

    const sparse =
      u.sync.status === 'ok' &&
      u.today.revenue === 0 &&
      u.mtd.revenue === 0 &&
      u.today.attended === 0 &&
      u.mtd.attended === 0
    if (sparse) {
      actions.push({
        id: `sparse-${u.unit.slug}`,
        severity: 'info',
        unit: u.unit.slug,
        title: `Dados financeiros fracos — ${u.unit.short}`,
        detail:
          'Sync ok, mas faturamento/atendidos estão zerados no mês. Verificar sync full Avec.',
        action: 'Priorizar sync full diário na unidade',
      })
    }

    const dayOk = isDayOperable(u)
    if (dayOk && u.today.noShows > 0) {
      actions.push({
        id: `noshow-${u.unit.slug}`,
        severity: u.today.noShows >= 3 ? 'critical' : 'warning',
        unit: u.unit.slug,
        title: `No-show — ${u.unit.short}`,
        detail: `${u.today.noShows} hoje · risco ~R$ ${Math.round(u.today.noShows * u.today.ticketAvg)}`,
        action: 'Remarcar + confirmação WhatsApp',
      })
    }

    if (dayOk && u.today.cancelled > 0) {
      actions.push({
        id: `cancel-${u.unit.slug}`,
        severity: u.today.cancelled >= 3 ? 'warning' : 'info',
        unit: u.unit.slug,
        title: `Cancelamentos — ${u.unit.short}`,
        detail: `${u.today.cancelled} hoje`,
        action: 'Encaixe na lista de espera',
      })
    }

    // Vagas: exige agenda confiável (não inventar capacity cheia com sync parcial).
    if (
      dayOk &&
      hasTrustedAgenda(u) &&
      u.today.capacitySet &&
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
    if (rolling && u.opsWeek.reactivationCount >= 5000) {
      actions.push({
        id: `react-cap-${u.unit.slug}`,
        severity: 'info',
        unit: u.unit.slug,
        title: `Sem retorno (lista cheia) — ${u.unit.short}`,
        detail: '5.000+ sem retorno (90d) · paginação Avec truncada',
        action: 'Tratar lista no ROM Contatos / campanha',
      })
    } else if (rolling && u.opsWeek.reactivationCount >= 50) {
      actions.push({
        id: `react-${u.unit.slug}`,
        severity: 'info',
        unit: u.unit.slug,
        title: `Sem retorno — ${u.unit.short}`,
        detail: `${u.opsWeek.reactivationCount} sem retorno (90d)`,
        action: 'Lista WhatsApp / campanha de retorno',
      })
    }

    if (rolling && u.opsWeek.returnRate > 0 && u.opsWeek.returnRate < 0.45) {
      actions.push({
        id: `return-${u.unit.slug}`,
        severity: 'warning',
        unit: u.unit.slug,
        title: `Retorno baixo — ${u.unit.short}`,
        detail: `${Math.round(u.opsWeek.returnRate * 100)}%`,
        action: 'Reforçar pós-atendimento',
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
      actions.push({
        id: `pay-${u.unit.slug}`,
        severity: 'warning',
        unit: u.unit.slug,
        title: `Conciliação 0081 — ${u.unit.short}`,
        detail: `Pagamentos ${Math.round(u.opsFinance.paymentsTotal)} vs receita MTD ${Math.round(u.opsFinance.mtdRevenue)}`,
        action: 'Conferir sync Avec 0081 no ROM',
      })
    }

    // Centenas/milhares de alertas = higiene de catálogo, não crise operacional.
    if (rolling && u.opsStock.available && u.opsStock.activeAlerts >= 50) {
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

  // Meta do dia: só unidades em operação (não soma meta de salão fechado).
  const active = units.filter(isSalonActiveToday)
  if (active.length > 0 && active.every((u) => u.today.goalSet)) {
    const activeGoal = active.reduce((a, u) => a + u.today.dailyGoal, 0)
    const activeRevenue = active.reduce((a, u) => a + u.today.revenue, 0)
    const gap = Math.max(0, activeGoal - activeRevenue)
    if (gap > 500) {
      const who =
        active.length === 1 ? active[0]!.unit.slug : ('both' as const)
      actions.push({
        id: 'goal-gap',
        severity: 'info',
        unit: who,
        title:
          active.length === 1
            ? `Meta do dia em aberto — ${active[0]!.unit.short}`
            : 'Meta do dia em aberto',
        detail: `Faltam R$ ${Math.round(gap).toLocaleString('pt-BR')} (só unidades em operação)`,
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
  const active = units.filter(isSalonActiveToday)
  /** Meta do dia: unidades com movimento. */
  const dayOps = active
  /** Ocupação/vagas: só com agenda confiável (não capacity cheia pós-wipe parcial). */
  const agendaOps = dayOps.filter(hasTrustedAgenda)

  const todayRevenue = units.reduce((a, u) => a + u.today.revenue, 0)
  const todayGoal = dayOps.reduce((a, u) => a + (u.today.goalSet ? u.today.dailyGoal : 0), 0)
  const goalsConfigured = units.every((u) => u.today.goalSet)
  const mtdRevenue = units.reduce((a, u) => a + u.mtd.revenue, 0)
  const mtdAttended = units.reduce((a, u) => a + u.mtd.attended, 0)
  const mtdGoal = units.reduce((a, u) => a + (u.mtd.goalSet ? u.mtd.goal : 0), 0)
  const attended = agendaOps.reduce((a, u) => a + u.today.attended, 0)
  const appointments = agendaOps.reduce((a, u) => a + u.today.appointments, 0)
  const noShows = agendaOps.reduce((a, u) => a + u.today.noShows, 0)
  const capacity = agendaOps.reduce((a, u) => a + (u.today.capacitySet ? u.today.capacity : 0), 0)
  const occupancyConfigured = agendaOps.length > 0 && agendaOps.every((u) => u.today.capacitySet)
  const newClients = dayOps.reduce((a, u) => a + u.today.newClients, 0)
  const returningClients = dayOps.reduce((a, u) => a + u.today.returningClients, 0)
  const leads = dayOps.reduce((a, u) => a + u.today.leads, 0)
  const converted = dayOps.reduce((a, u) => a + u.today.converted, 0)
  const mixBase = newClients + returningClients
  const cmvKnownUnits = units.filter((u) => u.opsFinance.cmvKnown)
  const cmv = cmvKnownUnits.reduce((a, u) => a + u.opsFinance.cmv, 0)
  const cmvMtd = cmvKnownUnits.reduce((a, u) => a + u.opsFinance.mtdRevenue, 0)
  const stockValue = units.reduce((a, u) => a + (u.opsStock.available ? u.opsStock.totalValue : 0), 0)
  const stockAlerts = units.reduce(
    (a, u) => a + (u.opsStock.available ? u.opsStock.activeAlerts : 0),
    0,
  )
  const dayRevenue = dayOps.reduce((a, u) => a + u.today.revenue, 0)

  return {
    todayRevenue,
    todayGoal,
    todayGoalProgress:
      dayOps.length > 0 && dayOps.every((u) => u.today.goalSet) && todayGoal > 0
        ? rate(dayRevenue, todayGoal)
        : 0,
    goalsConfigured,
    todayOpsActive: dayOps.length > 0,
    mtdRevenue,
    mtdGoal,
    mtdGoalProgress: goalsConfigured && mtdGoal > 0 ? rate(mtdRevenue, mtdGoal) : 0,
    mtdTicketAvg: mtdAttended > 0 ? Math.round(mtdRevenue / mtdAttended) : 0,
    attendanceRate: rate(attended, appointments),
    noShowRate: rate(noShows, appointments),
    occupancyRate: occupancyConfigured ? rate(appointments, capacity) : 0,
    occupancyConfigured,
    ticketAvg: attended > 0 ? Math.round(dayRevenue / attended) : 0,
    revenueAtRisk: agendaOps.reduce((a, u) => a + u.today.noShows * u.today.ticketAvg, 0),
    newClients,
    returningClients,
    conversionRate: rate(converted, leads),
    openSlotsToday: agendaOps.reduce((a, u) => a + u.opsToday.openSlotsToday, 0),
    openSlotsNext2h: agendaOps.reduce((a, u) => a + u.opsToday.openSlotsNext2h, 0),
    cancelledToday: dayOps.reduce((a, u) => a + u.today.cancelled, 0),
    noShowsToday: noShows,
    newShare: mixBase > 0 ? newClients / mixBase : 0,
    cmv,
    cmvShare: cmvKnownUnits.length > 0 && cmvMtd > 0 ? cmv / cmvMtd : null,
    stockValue,
    stockAlerts,
  }
}

function emptyConsolidated(): CerebroOverview['consolidated'] {
  return {
    todayRevenue: 0,
    todayGoal: 0,
    todayGoalProgress: 0,
    goalsConfigured: false,
    todayOpsActive: false,
    mtdRevenue: 0,
    mtdGoal: 0,
    mtdGoalProgress: 0,
    mtdTicketAvg: 0,
    attendanceRate: 0,
    noShowRate: 0,
    occupancyRate: 0,
    occupancyConfigured: false,
    ticketAvg: 0,
    revenueAtRisk: 0,
    newClients: 0,
    returningClients: 0,
    conversionRate: 0,
    openSlotsToday: 0,
    openSlotsNext2h: 0,
    cancelledToday: 0,
    noShowsToday: 0,
    newShare: 0,
    cmv: 0,
    cmvShare: null,
    stockValue: 0,
    stockAlerts: 0,
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

export async function buildLiveOverview(): Promise<CerebroOverview> {
  const configs = getUnitConfigs()
  const configured = configs.filter((c) => c.databaseUrl)
  if (configured.length === 0) {
    throw new Error('Nenhuma DATABASE_URL de unidade configurada (ou Brasil ainda em Neon)')
  }

  const settled = await Promise.allSettled(configured.map((c) => fetchLiveUnit(c)))
  const liveBySlug = new Map<string, UnitSnapshot>()
  const fetchErrors: AlertItem[] = []

  settled.forEach((result, idx) => {
    const cfg = configured[idx]!
    if (result.status === 'fulfilled') {
      liveBySlug.set(cfg.meta.slug, result.value)
    } else {
      const detail = String(result.reason?.message ?? result.reason)
      fetchErrors.push({
        id: `fetch-${cfg.meta.slug}`,
        severity: 'critical',
        unit: cfg.meta.slug,
        title: `DB offline — ${cfg.meta.name}`,
        detail,
        action: 'Validar connection string',
      })
      liveBySlug.set(
        cfg.meta.slug,
        offlineUnitSnapshot(cfg.meta, `Offline — ${detail.slice(0, 80)}`),
      )
    }
  })

  // Sempre Brasil + Iguatemi no painel (mesmo slot, mesmos campos).
  for (const cfg of configs) {
    if (liveBySlug.has(cfg.meta.slug)) continue
    const detail = cfg.databaseUrl
      ? 'Sem resposta'
      : cfg.meta.slug === 'rom-brasil'
        ? 'URL Brasil ausente ou ainda aponta para Neon (use pooler Supabase)'
        : 'NEON_IGUATEMI_DATABASE_URL ausente'
    fetchErrors.push({
      id: `missing-${cfg.meta.slug}`,
      severity: 'critical',
      unit: cfg.meta.slug,
      title: `Unidade ausente — ${cfg.meta.name}`,
      detail,
      action:
        cfg.meta.slug === 'rom-brasil'
          ? 'NEON_BRASIL_DATABASE_URL = pooler Supabase na Vercel'
          : 'Completar NEON_IGUATEMI_DATABASE_URL na Vercel',
    })
    liveBySlug.set(cfg.meta.slug, offlineUnitSnapshot(cfg.meta, detail))
  }

  const units = [UNIT_META['rom-brasil'], UNIT_META['rom-iguatemi']].map(
    (meta) => liveBySlug.get(meta.slug) ?? offlineUnitSnapshot(meta, 'Sem dados'),
  )

  const liveUnits = units.filter((u) => !u.sync.offline)
  if (liveUnits.length === 0) {
    throw new Error('Nenhuma unidade live respondeu')
  }

  const consolidated = consolidate(liveUnits)
  // Trend recebe todas (offline vira null na série — não zero falso).
  const trend30 = buildTrend30(units)

  const nextActions = [
    ...fetchErrors,
    ...buildNextActions(liveUnits, consolidated.goalsConfigured),
  ]
  if (liveUnits.length < 2) {
    nextActions.unshift({
      id: 'partial-units',
      severity: 'warning',
      unit: 'both',
      title: 'Consolidado parcial',
      detail: `Só ${liveUnits[0]?.unit.short ?? 'uma unidade'} ao vivo — a outra está no painel como offline`,
      action: 'Completar DATABASE_URL (Brasil=Supabase, Iguatemi=Neon)',
    })
  }

  const syncHardFail = units.some(isSyncHardFail)
  const syncPartial = units.some((u) => !u.sync.offline && u.sync.status === 'partial')
  const partial =
    liveUnits.length < 2 || fetchErrors.length > 0 || syncHardFail || syncPartial

  return {
    generatedAt: new Date().toISOString(),
    mode: 'live',
    partial,
    periodLabel: partial
      ? syncHardFail
        ? `Live parcial · sync com erro · ${todayIsoSaoPaulo()}`
        : syncPartial
          ? `Live parcial · sync incompleto · ${todayIsoSaoPaulo()}`
          : `Live parcial · ${todayIsoSaoPaulo()}`
      : `Live · ${todayIsoSaoPaulo()}`,
    consolidated,
    units,
    trend30,
    nextActions: sortNextActions(nextActions),
    comparison: buildComparison(units),
  }
}

export async function buildOverview(): Promise<CerebroOverview> {
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
          'DATABASE_URL das unidades ausente em produção (Brasil=Supabase, Iguatemi=Neon)',
          'Configurar NEON_BRASIL_DATABASE_URL (Supabase) e NEON_IGUATEMI_DATABASE_URL na Vercel',
          'no-unit-db',
        ),
        nextActions: [
          {
            id: 'no-unit-db',
            severity: 'critical',
            unit: 'both',
            title: 'DBs das unidades não configurados',
            detail: 'Connection strings ausentes ou Brasil ainda em Neon',
            action: 'Configurar URLs na Vercel (Brasil=pooler Supabase)',
          },
        ],
      }
    }
    return buildMockOverview()
  }

  try {
    return await buildLiveOverview()
  } catch (err) {
    return degradedOverview(
      String(err instanceof Error ? err.message : err),
      'Checar connection strings e reiniciar',
    )
  }
}
