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
import type { DayMetrics, OpsToday, UnitMeta, UnitSnapshot } from '@/lib/types'

function n(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const x = Number(v)
    return Number.isFinite(x) ? x : 0
  }
  return 0
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
    revenue: 0,
    appointments: 0,
    attended: 0,
    noShows: 0,
    cancelled: 0,
    newClients: 0,
    returningClients: 0,
    ticketAvg: 0,
    capacity,
    dailyGoal,
    goalSet,
    capacitySet,
    leads: 0,
    converted: 0,
  }
}

function buildOpsToday(today: DayMetrics, appointmentsNext2h: number): OpsToday {
  const openSlotsToday = today.capacitySet
    ? Math.max(0, today.capacity - today.appointments)
    : 0
  const capacityNext2h = today.capacitySet
    ? Math.max(1, Math.round((today.capacity / SALON_HOURS_PER_DAY) * 2))
    : 0
  const openSlotsNext2h = today.capacitySet
    ? Math.max(0, capacityNext2h - appointmentsNext2h)
    : 0
  const mixBase = today.newClients + today.returningClients
  const newShare = mixBase > 0 ? today.newClients / mixBase : 0

  return {
    openSlotsToday,
    appointmentsNext2h,
    capacityNext2h,
    openSlotsNext2h,
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
  const attended = n(row.attended)
  const revenue = n(row.revenue)
  const ticketAvg =
    row.ticket_avg != null ? n(row.ticket_avg) : attended > 0 ? revenue / attended : 0
  return {
    day,
    revenue,
    appointments: n(row.appointments),
    attended,
    noShows: n(row.no_shows),
    cancelled: n(row.cancelled),
    newClients: n(row.new_clients),
    returningClients: n(row.returning_clients),
    ticketAvg: Math.round(ticketAvg),
    capacity,
    dailyGoal,
    goalSet,
    capacitySet,
    leads,
    converted,
  }
}

/** Placeholder simétrico quando a unidade não responde — mesmos campos, sem inventar números. */
export function offlineUnitSnapshot(meta: UnitMeta, detail: string): UnitSnapshot {
  const today = todayIsoSaoPaulo()
  const day = emptyDay(today, 0, 0, false, false)
  return {
    unit: meta,
    today: day,
    opsToday: buildOpsToday(day, 0),
    opsWeek: {
      professionals: [],
      services: [],
      acquisition: [],
      reactivationCount: 0,
      returnRate: null,
      newClientsPeriod: 0,
    },
    opsCommerce: {
      bookingChannels: [],
      packages: [],
      packagesSold: 0,
      packagesRevenue: 0,
      ratingsAvg: 0,
      ratingsCount: 0,
      birthdayCount: 0,
      topBookingChannel: null,
    },
    opsFinance: { ...EMPTY_OPS_FINANCE },
    opsStock: { ...EMPTY_OPS_STOCK },
    mtd: {
      revenue: 0,
      attended: 0,
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

export async function fetchLiveUnit(config: UnitRuntimeConfig): Promise<UnitSnapshot> {
  if (!config.databaseUrl) {
    throw new Error(`Sem DATABASE_URL para ${config.meta.name}`)
  }

  const sql = getSql(config.databaseUrl)
  const today = todayIsoSaoPaulo()
  const monthStart = monthStartIso(today)
  const from30 = isoDaysBackFrom(today, 29)

  const dbGoals = await readGoalsFromDb(sql)
  const goals = resolveGoals(dbGoals, config.envGoals)
  const { dailyGoal, capacity, goalSet, capacitySet } = goals

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
    where day >= ${from30}::date
    order by day asc
  `) as MetricRow[]

  const byDay = new Map(metricRows.map((r) => [r.day.slice(0, 10), r]))

  let leadsToday = 0
  let convertedToday = 0
  try {
    // Paridade ROM: ignora dump Avec (importado / backfill / lake).
    const leadRows = (await sql`
      select
        count(*)::int as leads,
        count(*) filter (where status = 'convertido')::int as converted
      from contacts
      where (created_at at time zone 'America/Sao_Paulo')::date = ${today}::date
        and status <> 'importado'
        and coalesce(source, '') not like 'avec_sync_clients%'
        and coalesce(source, '') not like 'avec_backfill%'
        and coalesce(source, '') not like 'avec_lake%'
    `) as { leads: number; converted: number }[]
    leadsToday = n(leadRows[0]?.leads)
    convertedToday = n(leadRows[0]?.converted)
  } catch {
    // ok
  }

  const last30: DayMetrics[] = []
  for (let i = 29; i >= 0; i--) {
    const day = isoDaysBackFrom(today, i)
    const isToday = day === today
    last30.push(
      rowToDay(
        byDay.get(day),
        day,
        capacity,
        dailyGoal,
        goalSet,
        capacitySet,
        isToday ? leadsToday : 0,
        isToday ? convertedToday : 0,
      ),
    )
  }

  const todayMetrics = last30[last30.length - 1]!
  let appointmentsNext2h = 0
  try {
    const appt = (await sql`
      select count(*)::int as n
      from client_services
      where active = true
        and scheduled_at is not null
        and (scheduled_at at time zone 'America/Sao_Paulo')::date = ${today}::date
    `) as { n: number }[]
    const scheduled = n(appt[0]?.n)
    if (scheduled > todayMetrics.appointments) {
      todayMetrics.appointments = scheduled
    }

    const next2h = (await sql`
      select count(*)::int as n
      from client_services
      where active = true
        and scheduled_at is not null
        and scheduled_at >= now()
        and scheduled_at < now() + interval '2 hours'
    `) as { n: number }[]
    appointmentsNext2h = n(next2h[0]?.n)
  } catch {
    // ok
  }

  const mtdRows = last30.filter((d) => d.day >= monthStart)
  const mtdRevenue = mtdRows.reduce((a, d) => a + d.revenue, 0)
  const mtdAttended = mtdRows.reduce((a, d) => a + d.attended, 0)
  const mtd = {
    revenue: mtdRevenue,
    attended: mtdAttended,
    noShows: mtdRows.reduce((a, d) => a + d.noShows, 0),
    appointments: mtdRows.reduce((a, d) => a + d.appointments, 0),
    newClients: mtdRows.reduce((a, d) => a + d.newClients, 0),
    returningClients: mtdRows.reduce((a, d) => a + d.returningClients, 0),
    cancelled: mtdRows.reduce((a, d) => a + d.cancelled, 0),
    goal: goalSet ? dailyGoal * dayOfMonth(today) : 0,
    goalSet,
  }

  const opsToday = buildOpsToday(todayMetrics, appointmentsNext2h)

  const [opsWeek, opsCommerce, opsFinance, opsStock] = await Promise.all([
    fetchOpsWeek(sql, today),
    fetchOpsCommerce(sql, today),
    fetchOpsFinance(sql, monthStart, today, mtdRevenue, mtdAttended),
    fetchOpsStock(sql),
  ])

  let sync: UnitSnapshot['sync'] = {
    status: 'stale',
    lastSyncAt: new Date(0).toISOString(),
    label: 'Sem registro de sync Avec',
  }
  try {
    // Preferir sync de salão (fast/full). stock_* não deve mascarar token morto.
    const runs = (await sql`
      select status, created_at, error, kind
      from avec_sync_runs
      where kind in ('fast', 'full')
      order by created_at desc
      limit 1
    `) as { status: string; created_at: string; error: string | null; kind: string }[]
    let last = runs[0]
    if (!last) {
      const any = (await sql`
        select status, created_at, error, kind
        from avec_sync_runs
        order by created_at desc
        limit 1
      `) as { status: string; created_at: string; error: string | null; kind: string }[]
      last = any[0]
    }
    if (last) {
      const lastSyncAt = new Date(last.created_at).toISOString()
      const ageMs = Date.now() - new Date(last.created_at).getTime()
      const ageH = ageMs / 3_600_000
      const ageLabel =
        ageH < 1
          ? `${Math.max(1, Math.round(ageH * 60))} min`
          : `${ageH.toFixed(1)}h`

      if (last.status === 'error') {
        // Nunca rebaixar error→stale: token morto deve continuar hard-fail no painel.
        sync = {
          status: 'error',
          lastSyncAt,
          label: last.error
            ? `Sync erro (~${ageLabel}): ${last.error.slice(0, 80)}`
            : `Último sync com erro (~${ageLabel})`,
        }
      } else if (last.status === 'partial') {
        // Nunca rebaixar partial→stale: incompleto continua incompleto no chip Live.
        sync = {
          status: 'partial',
          lastSyncAt,
          label: last.error
            ? `Sync parcial (${last.kind}, ~${ageLabel}): ${last.error.slice(0, 80)}`
            : `Sync parcial (${last.kind}, ~${ageLabel}) · dados usáveis`,
        }
      } else if (ageH > 6) {
        // Sync full Avec pode levar 30–90+ min; janela saudável mais larga após sucesso.
        sync = {
          status: 'stale',
          lastSyncAt,
          label: `Sync atrasado (~${ageLabel})`,
        }
      } else {
        const mins = Math.max(1, Math.round(ageMs / 60_000))
        sync = {
          status: 'ok',
          lastSyncAt,
          label:
            mins < 60
              ? `Avec sync há ${mins} min`
              : `Avec sync há ${(mins / 60).toFixed(1)}h`,
        }
      }
    }
  } catch {
    // ok
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
