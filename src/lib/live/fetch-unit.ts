import { getSql } from '@/lib/db'
import {
  dayOfMonth,
  isoDaysBackFrom,
  monthStartIso,
  SALON_HOURS_PER_DAY,
  todayIsoSaoPaulo,
  type UnitRuntimeConfig,
} from '@/lib/unit-config'
import { fetchOpsCommerce, fetchOpsWeek } from '@/lib/live/parse-kpi-layers'
import { EMPTY_OPS_FINANCE, EMPTY_OPS_STOCK, fetchOpsFinance, fetchOpsStock } from '@/lib/live/fetch-money-stock'
import { readGoalsFromDb, resolveGoals } from '@/lib/goals'
import { sanitizeDayMix } from '@/lib/live/sanitize-day-mix'
import { resolveUnitSyncStatus, type UnitSyncRunRow } from '@/lib/live/sync-status'
import type { DayMetrics, OpsToday, UnitMeta, UnitSnapshot } from '@/lib/types'

export { sanitizeDayMix } from '@/lib/live/sanitize-day-mix'

function n(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const x = Number(v)
    return Number.isFinite(x) ? x : 0
  }
  return 0
}

/** Returns null for null/undefined/''; coerces numeric strings. */
function nNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim()) {
    const x = Number(v)
    return Number.isFinite(x) ? x : null
  }
  return null
}

function emptyDay(
  day: string,
  capacity: number,
  dailyGoal: number,
  goalSet: boolean,
  capacitySet: boolean,
): DayMetrics {
  return {
    day,
    revenue: null,
    appointments: null,
    attended: null,
    noShows: null,
    cancelled: null,
    newClients: null,
    returningClients: null,
    ticketAvg: null,
    capacity,
    dailyGoal,
    goalSet,
    capacitySet,
    leads: 0,
    converted: 0,
  }
}

function buildOpsToday(
  today: DayMetrics,
  appointmentsNext2h: number,
  slotsNext2hKnown: boolean,
): OpsToday {
  // Null appointments = unknown; treat as 0 only when capacitySet (conservative).
  const openSlotsToday =
    today.capacitySet && today.appointments != null
      ? Math.max(0, today.capacity - today.appointments)
      : 0
  const known = today.capacitySet && slotsNext2hKnown
  const capacityNext2h = known
    ? Math.max(0, Math.round((today.capacity / SALON_HOURS_PER_DAY) * 2))
    : 0
  const openSlotsNext2h = known ? Math.max(0, capacityNext2h - appointmentsNext2h) : 0
  const newC = today.newClients ?? 0
  const retC = today.returningClients ?? 0
  const mixBase = newC + retC
  const newShare = mixBase > 0 ? newC / mixBase : 0

  return {
    openSlotsToday,
    appointmentsNext2h: known ? appointmentsNext2h : 0,
    capacityNext2h,
    openSlotsNext2h,
    slotsNext2hKnown: known,
    newShare,
  }
}

type MetricRow = {
  day: string
  revenue: unknown
  appointments: unknown
  attended: unknown
  no_shows: unknown
  cancelled: unknown
  new_clients: unknown
  returning_clients: unknown
  ticket_avg: unknown
}

function rowToDay(
  row: MetricRow | undefined,
  day: string,
  capacity: number,
  dailyGoal: number,
  goalSet: boolean,
  capacitySet: boolean,
  leads = 0,
  converted = 0,
): DayMetrics {
  if (!row) return emptyDay(day, capacity, dailyGoal, goalSet, capacitySet)
  const attended = nNull(row.attended)
  const revenue = nNull(row.revenue)
  const rawTicketAvg = nNull(row.ticket_avg)
  const ticketAvg =
    rawTicketAvg !== null
      ? Math.round(rawTicketAvg)
      : attended != null && attended > 0 && revenue != null
        ? Math.round(revenue / attended)
        : null
  return {
    day,
    revenue,
    appointments: nNull(row.appointments),
    attended,
    noShows: nNull(row.no_shows),
    cancelled: nNull(row.cancelled),
    newClients: nNull(row.new_clients),
    returningClients: nNull(row.returning_clients),
    ticketAvg,
    capacity,
    dailyGoal,
    goalSet,
    capacitySet,
    leads,
    converted,
  }
}

/** Placeholder simétrico quando a unidade não responde — mesmos campos, sem inventar números. */
export function offlineUnitSnapshot(
  meta: UnitMeta,
  detail: string,
  asOf?: string,
): UnitSnapshot {
  const today = asOf ?? todayIsoSaoPaulo()
  const day = emptyDay(today, 0, 0, false, false)
  return {
    unit: meta,
    today: day,
    opsToday: buildOpsToday(day, 0, false),
    opsWeek: {
      professionals: [],
      services: [],
      acquisition: [],
      reactivationCount: null,
      returnRate: null,
      newClientsPeriod: null,
      asOfDay: null,
      returnAsOfDay: null,
    },
    opsCommerce: {
      bookingChannels: [],
      packages: [],
      packagesSold: 0,
      packagesRevenue: 0,
      packagesKnown: false,
      ratingsAvg: 0,
      ratingsCount: 0,
      birthdayCount: 0,
      topBookingChannel: null,
      asOfDay: null,
    },
    opsFinance: { ...EMPTY_OPS_FINANCE },
    opsStock: { ...EMPTY_OPS_STOCK },
    mtd: {
      revenue: null,
      attended: null,
      noShows: 0,
      appointments: 0,
      newClients: 0,
      returningClients: 0,
      cancelled: 0,
      goal: 0,
      goalSet: false,
    },
    last30: [],
    sync: {
      status: 'error',
      lastSyncAt: '',
      label: detail,
      offline: true,
    },
  }
}

async function readUnitSyncStatus(sql: ReturnType<typeof getSql>): Promise<UnitSnapshot['sync']> {
  // Paridade com salon loadAvecSyncMeta (sync-meta v5, full fatiado):
  // - finished: running ≠ true
  // - full analytics = ops (ou legado all), não catalog
  // - fastStale só se fast finished existe e >1h (não se fast==null)
  // - running mid-flight só ameniza stale dentro de TTL curto
  const empty: UnitSnapshot['sync'] = {
    status: 'stale',
    lastSyncAt: new Date(0).toISOString(),
    label: 'Sem registro de sync Avec',
  }

  try {
    // Full fatiado: Visão/analytics = ops (ou legado all). Catalog fresco
    // não deve mascarar ops velho (paridade sync-meta v5 nos salões).
    const [opsRows, legacyFullRows, anyFullRows, fastRows, runningRows] = await Promise.all([
      sql`
        select status, created_at, error, kind
        from avec_sync_runs
        where kind = 'full'
          and coalesce(stats->>'running', 'false') <> 'true'
          and coalesce(stats->>'stage', 'all') = 'ops'
        order by created_at desc
        limit 1
      `,
      sql`
        select status, created_at, error, kind
        from avec_sync_runs
        where kind = 'full'
          and coalesce(stats->>'running', 'false') <> 'true'
          and coalesce(stats->>'stage', 'all') = 'all'
        order by created_at desc
        limit 1
      `,
      sql`
        select status, created_at, error, kind
        from avec_sync_runs
        where kind = 'full'
          and coalesce(stats->>'running', 'false') <> 'true'
        order by created_at desc
        limit 1
      `,
      sql`
        select status, created_at, error, kind
        from avec_sync_runs
        where kind = 'fast'
          and coalesce(stats->>'running', 'false') <> 'true'
        order by created_at desc
        limit 1
      `,
      sql`
        select created_at
        from avec_sync_runs
        where kind in ('fast', 'full')
          and coalesce(stats->>'running', 'false') = 'true'
        order by created_at desc
        limit 1
      `,
    ])

    const full =
      (opsRows as UnitSyncRunRow[])[0] ??
      (legacyFullRows as UnitSyncRunRow[])[0] ??
      (anyFullRows as UnitSyncRunRow[])[0] ??
      null
    const fast = (fastRows as UnitSyncRunRow[])[0] ?? null
    const runningAt = (runningRows as { created_at: string }[])[0]?.created_at ?? null
    return resolveUnitSyncStatus({ full, fast, runningAt })
  } catch {
    return empty
  }
}

export async function fetchLiveUnit(
  config: UnitRuntimeConfig,
  asOf?: string,
): Promise<UnitSnapshot> {
  if (!config.databaseUrl) {
    throw new Error(`Sem DATABASE_URL para ${config.meta.name}`)
  }

  const sql = getSql(config.databaseUrl)
  const calendarToday = todayIsoSaoPaulo()
  const today = asOf ?? calendarToday
  const isHistorical = today < calendarToday
  const monthStart = monthStartIso(today)
  const from30 = isoDaysBackFrom(today, 29)
  // MTD precisa do mês inteiro; last30 precisa de 30d — buscar o intervalo mais largo.
  const fromMetrics = monthStart < from30 ? monthStart : from30

  const dbGoals = await readGoalsFromDb(sql)
  const goals = resolveGoals(dbGoals, config.envGoals)
  const { dailyGoal, capacity, goalSet, capacitySet } = goals

  {
    const core = (await sql`
      select to_regclass('public.salon_daily_metrics') is not null as ok
    `) as { ok: boolean }[]
    if (!core[0]?.ok) {
      throw new Error(
        `Schema incompleto — falta salon_daily_metrics em ${config.meta.name}. Rodar migrations na unidade.`,
      )
    }
  }

  const metricRows = (await sql`
    select
      day::text as day,
      revenue,
      appointments,
      attended,
      no_shows,
      cancelled,
      new_clients,
      returning_clients,
      ticket_avg
    from salon_daily_metrics
    where day >= ${fromMetrics}::date
      and day <= ${today}::date
    order by day asc
  `) as MetricRow[]

  const byDay = new Map(metricRows.map((r) => [r.day.slice(0, 10), r]))

  let leadsToday = 0
  let convertedToday = 0
  try {
    // Só leads ROM reais — dump Avec (clients/appointments/backfill/lake) polui o card.
    const leadRows = (await sql`
      select
        count(*)::int as leads,
        count(*) filter (where status = 'convertido')::int as converted
      from contacts
      where (created_at at time zone 'America/Sao_Paulo')::date = ${today}::date
        and status <> 'importado'
        and coalesce(source, '') not like 'avec_%'
    `) as { leads: number; converted: number }[]
    leadsToday = n(leadRows[0]?.leads)
    convertedToday = n(leadRows[0]?.converted)
  } catch {
    // ok
  }

  const last30: DayMetrics[] = []
  for (let i = 29; i >= 0; i--) {
    const day = isoDaysBackFrom(today, i)
    const isAsOf = day === today
    const row = rowToDay(
      byDay.get(day),
      day,
      capacity,
      dailyGoal,
      goalSet,
      capacitySet,
      isAsOf ? leadsToday : 0,
      isAsOf ? convertedToday : 0,
    )
    // Hoje: sanitize depois do recompute de appointments (mix usa apptCap).
    if (!isAsOf) sanitizeDayMix(row, capacity, capacitySet)
    last30.push(row)
  }

  const todayMetrics = last30[last30.length - 1]!
  // Leads ROM (não dump Avec) — sobrescreve o campo do dia.
  todayMetrics.leads = leadsToday
  todayMetrics.converted = convertedToday

  let appointmentsNext2h = 0
  /**
   * Janela 2h só olha `scheduled_at` futuro — independente de a agenda do dia
   * ter vindo de metrics (CS cai quando serviços são concluídos e limpam horário).
   */
  let slotsNext2hKnown = false
  /** true when CS day count was coherent (scheduled >= attended); gates 2h trust. */
  let csTrustedForToday = false
  try {
    // Paridade recompute salon: abertos do dia + concluídos do dia (não só leftovers).
    // Cabeças (DISTINCT contact_id) — paridade com recomputeSalonMetricsFromRom nas unidades.
    const appt = (await sql`
      select count(distinct cs.contact_id)::int as n
      from client_services cs
      join contacts c on c.id = cs.contact_id
      where cs.active = true
        and c.anonymized_at is null
        and (
          (
            cs.scheduled_at is not null
            and (cs.scheduled_at at time zone 'America/Sao_Paulo')::date = ${today}::date
            and (
              cs.last_done_at is null
              or (cs.last_done_at at time zone 'America/Sao_Paulo')::date <> ${today}::date
            )
          )
          or (
            cs.last_done_at is not null
            and (cs.last_done_at at time zone 'America/Sao_Paulo')::date = ${today}::date
          )
        )
    `) as { n: number }[]
    const scheduled = n(appt[0]?.n)
    const metricAppt = todayMetrics.appointments ?? 0
    const todayAttended = todayMetrics.attended ?? 0
    // client_services no ROM pode estar incompleto vs Avec (metrics).
    // Nunca deixar appointments < attended (quebra comparecimento/vagas).
    if (scheduled >= todayAttended && scheduled > 0) {
      // Live coerente: CS is trusted. Se metrics Avec tem mais agenda (mesmo lag leve), prefer metrics
      // — no-shows/cancel vêm de metrics; CS incompleto distorce comparecimento/vagas.
      csTrustedForToday = true
      if (metricAppt >= todayAttended && metricAppt > scheduled) {
        todayMetrics.appointments = metricAppt
      } else {
        todayMetrics.appointments = scheduled
      }
    } else if (metricAppt >= todayAttended && metricAppt > 0) {
      todayMetrics.appointments = metricAppt
    } else {
      todayMetrics.appointments = Math.max(scheduled, metricAppt, todayAttended)
    }

    // Vagas 2h só no dia corrente (janela wall-clock).
    // slotsNext2hKnown requer CS confiável para o dia + query 2h executada.
    if (!isHistorical) {
      const next2h = (await sql`
        select count(distinct cs.contact_id)::int as n
        from client_services cs
        join contacts c on c.id = cs.contact_id
        where cs.active = true
          and c.anonymized_at is null
          and cs.scheduled_at is not null
          and cs.scheduled_at >= now()
          and cs.scheduled_at < now() + interval '2 hours'
      `) as { n: number }[]
      appointmentsNext2h = n(next2h[0]?.n)
      slotsNext2hKnown = csTrustedForToday
    }
  } catch {
    slotsNext2hKnown = false
  }

  sanitizeDayMix(todayMetrics, capacity, capacitySet)

  const mtdRows: DayMetrics[] = []
  {
    // Dias do mês até asOf — não cortar no dia 31 (janela last30 deixa dia 1 de fora).
    const monthLen = dayOfMonth(today)
    for (let i = monthLen - 1; i >= 0; i--) {
      const day = isoDaysBackFrom(today, i)
      if (day < monthStart) continue
      const isAsOf = day === today
      if (isAsOf) {
        // Usa o today já recomputado (CS appointments + sanitize).
        mtdRows.push(todayMetrics)
        continue
      }
      const row = rowToDay(
        byDay.get(day),
        day,
        capacity,
        dailyGoal,
        goalSet,
        capacitySet,
        0,
        0,
      )
      // Sanitiza todos os dias do MTD — dump de novos num dia antigo inflava o mês.
      sanitizeDayMix(row, capacity, capacitySet)
      mtdRows.push(row)
    }
  }
  const revenueKnown = mtdRows.some((d) => d.revenue != null)
  const attendedKnown = mtdRows.some((d) => d.attended != null)
  const mtdRevenue = revenueKnown
    ? mtdRows.reduce((a, d) => a + (d.revenue ?? 0), 0)
    : null
  const mtdAttended = attendedKnown
    ? mtdRows.reduce((a, d) => a + (d.attended ?? 0), 0)
    : null
  const mtd = {
    revenue: mtdRevenue,
    attended: mtdAttended,
    noShows: mtdRows.reduce((a, d) => a + (d.noShows ?? 0), 0),
    appointments: mtdRows.reduce((a, d) => a + (d.appointments ?? 0), 0),
    newClients: mtdRows.reduce((a, d) => a + (d.newClients ?? 0), 0),
    returningClients: mtdRows.reduce((a, d) => a + (d.returningClients ?? 0), 0),
    cancelled: mtdRows.reduce((a, d) => a + (d.cancelled ?? 0), 0),
    goal: goalSet ? dailyGoal * dayOfMonth(today) : 0,
    goalSet,
  }

  const opsToday = buildOpsToday(todayMetrics, appointmentsNext2h, slotsNext2hKnown)

  const [opsWeek, opsCommerce, opsFinance, opsStock] = await Promise.all([
    fetchOpsWeek(sql, today, monthStart),
    fetchOpsCommerce(sql, today),
    fetchOpsFinance(sql, monthStart, today, mtdRevenue, mtdAttended),
    // Estoque é posição live — não rebobina. Em asOf histórico omitimos para não mentir.
    isHistorical ? Promise.resolve({ ...EMPTY_OPS_STOCK }) : fetchOpsStock(sql),
  ])

  let sync = await readUnitSyncStatus(sql)

  if (isHistorical && sync.status !== 'error') {
    sync = {
      ...sync,
      label: `${sync.label} · métricas do dia ${today} (P1–P3 = snapshot ≤ data · estoque omitido)`,
    }
  }

  return {
    unit: config.meta,
    today: todayMetrics,
    opsToday,
    opsWeek,
    opsCommerce,
    opsFinance,
    opsStock,
    mtd,
    last30,
    sync,
  }
}
