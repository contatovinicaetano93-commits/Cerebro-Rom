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

/**
 * Mix novos/recorrentes do Avec às vezes conta agenda como “novo”.
 * Zera quando o dia ainda não tem dinheiro OU o mix é impossível/absurdo.
 */
function sanitizeDayMix(day: DayMetrics, capacity: number, capacitySet: boolean): void {
  if (day.attended <= 0 && day.revenue <= 0) {
    day.newClients = 0
    day.returningClients = 0
    return
  }
  const mix = day.newClients + day.returningClients
  if (day.appointments > 0 && mix > day.appointments) {
    day.newClients = 0
    day.returningClients = 0
    return
  }
  // Ex.: 838 “novos” com capacidade 110 — lixo de sync, não KPI.
  if (capacitySet && capacity > 0 && day.newClients > capacity * 1.5) {
    day.newClients = 0
    day.returningClients = 0
  }
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

function buildOpsToday(
  today: DayMetrics,
  appointmentsNext2h: number,
  slotsNext2hKnown: boolean,
): OpsToday {
  const openSlotsToday = today.capacitySet
    ? Math.max(0, today.capacity - today.appointments)
    : 0
  const known = today.capacitySet && slotsNext2hKnown
  const capacityNext2h = known
    ? Math.max(1, Math.round((today.capacity / SALON_HOURS_PER_DAY) * 2))
    : 0
  const openSlotsNext2h = known ? Math.max(0, capacityNext2h - appointmentsNext2h) : 0
  const mixBase = today.newClients + today.returningClients
  const newShare = mixBase > 0 ? today.newClients / mixBase : 0

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

async function readUnitSyncStatus(sql: ReturnType<typeof getSql>): Promise<UnitSnapshot['sync']> {
  let sync: UnitSnapshot['sync'] = {
    status: 'stale',
    lastSyncAt: new Date(0).toISOString(),
    label: 'Sem registro de sync Avec',
  }
  try {
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
        sync = {
          status: 'error',
          lastSyncAt,
          label: last.error
            ? `Sync erro (~${ageLabel}): ${last.error.slice(0, 80)}`
            : `Último sync com erro (~${ageLabel})`,
        }
      } else if (last.status === 'partial') {
        sync = {
          status: 'partial',
          lastSyncAt,
          label: last.error
            ? `Sync parcial (${last.kind}, ~${ageLabel}): ${last.error.slice(0, 80)}`
            : `Sync parcial (${last.kind}, ~${ageLabel}) · dados usáveis`,
        }
      } else if (ageH > 6) {
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
  return sync
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
    last30.push(
      rowToDay(
        byDay.get(day),
        day,
        capacity,
        dailyGoal,
        goalSet,
        capacitySet,
        isAsOf ? leadsToday : 0,
        isAsOf ? convertedToday : 0,
      ),
    )
  }

  const todayMetrics = last30[last30.length - 1]!
  sanitizeDayMix(todayMetrics, capacity, capacitySet)
  // Leads ROM (não dump Avec) — sobrescreve o campo do dia.
  todayMetrics.leads = leadsToday
  todayMetrics.converted = convertedToday

  let appointmentsNext2h = 0
  /** Só confiar em CS 2h se a agenda do dia também veio do live CS (não de metrics). */
  let trustCsForNext2h = false
  try {
    const appt = (await sql`
      select count(*)::int as n
      from client_services
      where active = true
        and scheduled_at is not null
        and (scheduled_at at time zone 'America/Sao_Paulo')::date = ${today}::date
    `) as { n: number }[]
    const scheduled = n(appt[0]?.n)
    const metricAppt = todayMetrics.appointments
    const attended = todayMetrics.attended
    // client_services no ROM pode estar incompleto vs Avec (metrics).
    // Nunca deixar appointments < attended (quebra comparecimento/vagas).
    if (scheduled >= attended && scheduled > 0) {
      // Live coerente: usa CS. Se metrics Avec tem mais agenda (mesmo lag leve), prefer metrics
      // — no-shows/cancel vêm de metrics; CS incompleto distorce comparecimento/vagas/2h.
      if (metricAppt >= attended && metricAppt > scheduled) {
        todayMetrics.appointments = metricAppt
        trustCsForNext2h = false
      } else {
        todayMetrics.appointments = scheduled
        trustCsForNext2h = true
      }
    } else if (metricAppt >= attended && metricAppt > 0) {
      todayMetrics.appointments = metricAppt
      trustCsForNext2h = false
    } else {
      todayMetrics.appointments = Math.max(scheduled, metricAppt, attended)
      trustCsForNext2h = scheduled > 0 && scheduled === todayMetrics.appointments
    }

    // Vagas 2h só fazem sentido no dia corrente (janela wall-clock).
    if (trustCsForNext2h && !isHistorical) {
      const next2h = (await sql`
        select count(*)::int as n
        from client_services
        where active = true
          and scheduled_at is not null
          and scheduled_at >= now()
          and scheduled_at < now() + interval '2 hours'
      `) as { n: number }[]
      appointmentsNext2h = n(next2h[0]?.n)
    } else if (isHistorical) {
      trustCsForNext2h = false
      appointmentsNext2h = 0
    }
  } catch {
    trustCsForNext2h = false
  }

  const mtdRows: DayMetrics[] = []
  {
    // Dias do mês até asOf — não cortar no dia 31 (janela last30 deixa dia 1 de fora).
    const monthLen = dayOfMonth(today)
    for (let i = monthLen - 1; i >= 0; i--) {
      const day = isoDaysBackFrom(today, i)
      if (day < monthStart) continue
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
      if (isAsOf) sanitizeDayMix(row, capacity, capacitySet)
      mtdRows.push(row)
    }
  }
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

  const opsToday = buildOpsToday(todayMetrics, appointmentsNext2h, trustCsForNext2h)

  const [opsWeek, opsCommerce, opsFinance, opsStock] = [
    await fetchOpsWeek(sql, today, monthStart),
    await fetchOpsCommerce(sql, today),
    await fetchOpsFinance(sql, monthStart, today, mtdRevenue, mtdAttended),
    await fetchOpsStock(sql),
  ]

  let sync = await readUnitSyncStatus(sql)

  if (isHistorical && sync.status !== 'error') {
    sync = {
      ...sync,
      label: `${sync.label} · métricas do dia ${today} (estoque/sync = agora)`,
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
