import { getSql } from '@/lib/db'
import {
  dayOfMonth,
  isoDaysBackFrom,
  monthStartIso,
  SALON_HOURS_PER_DAY,
  todayIsoSaoPaulo,
  type UnitRuntimeConfig,
} from '@/lib/unit-config'
import type { DayMetrics, OpsP0, UnitSnapshot } from '@/lib/types'

function n(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const x = Number(v)
    return Number.isFinite(x) ? x : 0
  }
  return 0
}

function emptyDay(day: string, capacity: number, dailyGoal: number): DayMetrics {
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
    leads: 0,
    converted: 0,
  }
}

function buildOpsP0(today: DayMetrics, appointmentsNext2h: number): OpsP0 {
  const openSlotsToday = Math.max(0, today.capacity - today.appointments)
  const capacityNext2h = Math.max(1, Math.round((today.capacity / SALON_HOURS_PER_DAY) * 2))
  const openSlotsNext2h = Math.max(0, capacityNext2h - appointmentsNext2h)
  const mixBase = today.newClients + today.returningClients
  const newShare = mixBase > 0 ? today.newClients / mixBase : 0

  return {
    openSlotsToday,
    appointmentsNext2h,
    capacityNext2h,
    openSlotsNext2h,
    cancelledToday: today.cancelled,
    noShowsToday: today.noShows,
    newClientsToday: today.newClients,
    returningClientsToday: today.returningClients,
    newShare,
    cancelSource: 'Avec 0052',
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

async function tableExists(sql: ReturnType<typeof getSql>, name: string): Promise<boolean> {
  const rows = (await sql`
    select to_regclass(${`public.${name}`}) is not null as ok
  `) as { ok: boolean }[]
  return Boolean(rows[0]?.ok)
}

function rowToDay(
  row: MetricRow | undefined,
  day: string,
  capacity: number,
  dailyGoal: number,
  leads = 0,
  converted = 0,
): DayMetrics {
  if (!row) return emptyDay(day, capacity, dailyGoal)
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
    leads,
    converted,
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
    const leadRows = (await sql`
      select
        count(*)::int as leads,
        count(*) filter (where status = 'convertido')::int as converted
      from contacts
      where (created_at at time zone 'America/Sao_Paulo')::date = ${today}::date
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
        config.capacity,
        config.dailyGoal,
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
        and scheduled_at >= (now() at time zone 'America/Sao_Paulo')
        and scheduled_at < (now() at time zone 'America/Sao_Paulo') + interval '2 hours'
    `) as { n: number }[]
    appointmentsNext2h = n(next2h[0]?.n)
  } catch {
    // ok
  }

  const mtdRows = last30.filter((d) => d.day >= monthStart)
  const mtd = {
    revenue: mtdRows.reduce((a, d) => a + d.revenue, 0),
    attended: mtdRows.reduce((a, d) => a + d.attended, 0),
    noShows: mtdRows.reduce((a, d) => a + d.noShows, 0),
    appointments: mtdRows.reduce((a, d) => a + d.appointments, 0),
    newClients: mtdRows.reduce((a, d) => a + d.newClients, 0),
    returningClients: mtdRows.reduce((a, d) => a + d.returningClients, 0),
    cancelled: mtdRows.reduce((a, d) => a + d.cancelled, 0),
    goal: config.dailyGoal * dayOfMonth(today),
  }

  const opsP0 = buildOpsP0(todayMetrics, appointmentsNext2h)

  let topProfessionals: UnitSnapshot['topProfessionals'] = []
  if (await tableExists(sql, 'professionals')) {
    try {
      const hasPdm = await tableExists(sql, 'professional_daily_metrics')
      if (hasPdm) {
        const rows = (await sql`
          select
            p.id::text as id,
            p.name,
            coalesce(sum(m.revenue), 0)::float8 as revenue,
            coalesce(sum(m.attended), 0)::int as attended,
            coalesce(sum(m.appointments), 0)::int as appointments
          from professionals p
          left join professional_daily_metrics m
            on m.professional_id = p.id
           and m.day >= ${monthStart}::date
          where p.active = true
          group by p.id, p.name
          order by revenue desc, attended desc, p.name asc
          limit 5
        `) as {
          id: string
          name: string
          revenue: unknown
          attended: unknown
          appointments: unknown
        }[]
        topProfessionals = rows.map((r) => {
          const attended = n(r.attended)
          const revenue = n(r.revenue)
          const appointments = n(r.appointments)
          return {
            id: r.id,
            name: r.name,
            revenue: Math.round(revenue),
            attended,
            ticketAvg: attended > 0 ? Math.round(revenue / attended) : 0,
            occupancy: appointments > 0 ? Math.min(1, attended / appointments) : 0,
          }
        })
      } else {
        const rows = (await sql`
          select id::text as id, name from professionals where active = true order by name limit 5
        `) as { id: string; name: string }[]
        topProfessionals = rows.map((r) => ({
          id: r.id,
          name: r.name,
          revenue: 0,
          attended: 0,
          ticketAvg: 0,
          occupancy: 0,
        }))
      }
    } catch {
      topProfessionals = []
    }
  }

  let sync: UnitSnapshot['sync'] = {
    status: 'stale',
    lastSyncAt: new Date(0).toISOString(),
    label: 'Sem registro de sync Avec',
  }
  try {
    const runs = (await sql`
      select status, created_at, error
      from avec_sync_runs
      order by created_at desc
      limit 1
    `) as { status: string; created_at: string; error: string | null }[]
    const last = runs[0]
    if (last) {
      const lastSyncAt = new Date(last.created_at).toISOString()
      const ageMs = Date.now() - new Date(last.created_at).getTime()
      const ageH = ageMs / 3_600_000
      const missingTokenHint =
        !last.error || /AVEC_API_TOKEN|não configurado|nao configurado/i.test(last.error)

      if (last.status === 'error' && ageH <= 24) {
        sync = {
          status: ageH > 6 ? 'stale' : 'error',
          lastSyncAt,
          label: last.error
            ? `Sync erro: ${last.error.slice(0, 80)}`
            : 'Último sync com erro',
        }
      } else if (last.status === 'error' && ageH > 24) {
        sync = {
          status: 'stale',
          lastSyncAt,
          label: missingTokenHint
            ? 'Aguardando AVEC_API_TOKEN · último sync antigo com erro'
            : `Último sync com erro há ~${ageH.toFixed(0)}h (aguardando novo sync)`,
        }
      } else if (ageH > 3) {
        sync = {
          status: 'stale',
          lastSyncAt,
          label: `Sync atrasado (~${ageH.toFixed(1)}h)`,
        }
      } else {
        const mins = Math.max(1, Math.round(ageMs / 60_000))
        sync = {
          status: 'ok',
          lastSyncAt,
          label: `Avec sync há ${mins} min`,
        }
      }
    }
  } catch {
    // ok
  }

  return {
    unit: config.meta,
    today: todayMetrics,
    opsP0,
    mtd,
    last30,
    topProfessionals,
    sync,
  }
}
