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
  // Paridade com salon loadAvecSyncMeta (sync-meta v2):
  // - só runs finished (stats.running ≠ true)
  // - stale se nunca syncou OU full >24h OU fast >1h
  const empty: UnitSnapshot['sync'] = {
    status: 'stale',
    lastSyncAt: new Date(0).toISOString(),
    label: 'Sem registro de sync Avec',
  }

  try {
    const [fullRows, fastRows] = await Promise.all([
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
    ])

    const full =
      (fullRows as { status: string; created_at: string; error: string | null; kind: string }[])[0] ??
      null
    const fast =
      (fastRows as { status: string; created_at: string; error: string | null; kind: string }[])[0] ??
      null
    if (!full && !fast) return empty

    const fullAgeHours =
      full != null ? (Date.now() - new Date(full.created_at).getTime()) / 3_600_000 : null
    const fastAgeHours =
      fast != null ? (Date.now() - new Date(fast.created_at).getTime()) / 3_600_000 : null
    const fullStale = fullAgeHours != null && fullAgeHours > 24
    const fastStale = fast == null || (fastAgeHours != null && fastAgeHours > 1)
    const ageStale = fullStale || fastStale

    const latest =
      full && fast
        ? new Date(fast.created_at).getTime() >= new Date(full.created_at).getTime()
          ? fast
          : full
        : (full ?? fast)!

    const lastSyncAt = new Date(latest.created_at).toISOString()
    const ageMs = Date.now() - new Date(latest.created_at).getTime()
    const ageH = ageMs / 3_600_000
    const ageLabel =
      ageH < 1 ? `${Math.max(1, Math.round(ageH * 60))} min` : `${ageH.toFixed(1)}h`

    if (latest.status === 'error') {
      return {
        status: 'error',
        lastSyncAt,
        label: latest.error
          ? `Sync erro (~${ageLabel}): ${latest.error.slice(0, 80)}`
          : `Último sync com erro (~${ageLabel})`,
      }
    }

    if (ageStale) {
      if (fast == null) {
        return {
          status: 'stale',
          lastSyncAt,
          label: 'Sem sync fast recente — caixa/Hoje pode estar velho',
        }
      }
      if (fastStale && fastAgeHours != null) {
        return {
          status: 'stale',
          lastSyncAt,
          label: `Sync fast atrasado (~${Math.max(1, Math.round(fastAgeHours * 60))} min) — caixa/Hoje pode estar velho`,
        }
      }
      if (fullStale && fullAgeHours != null) {
        return {
          status: 'stale',
          lastSyncAt,
          label: `Sync full atrasado (~${fullAgeHours.toFixed(1)}h) — analytics desatualizados`,
        }
      }
      return {
        status: 'stale',
        lastSyncAt,
        label: `Sync atrasado (~${ageLabel})`,
      }
    }

    if (latest.status === 'partial') {
      return {
        status: 'partial',
        lastSyncAt,
        label: latest.error
          ? `Sync parcial (${latest.kind}, ~${ageLabel}): ${latest.error.slice(0, 80)}`
          : `Sync parcial (${latest.kind}, ~${ageLabel}) · dados usáveis`,
      }
    }

    const mins = Math.max(1, Math.round(ageMs / 60_000))
    return {
      status: 'ok',
      lastSyncAt,
      label:
        mins < 60
          ? `Avec sync há ${mins} min`
          : `Avec sync há ${(mins / 60).toFixed(1)}h`,
    }
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
    sanitizeDayMix(row, capacity, capacitySet)
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
  try {
    // Paridade recompute salon: abertos do dia + concluídos do dia (não só leftovers).
    const appt = (await sql`
      select count(*)::int as n
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
    const metricAppt = todayMetrics.appointments
    const attended = todayMetrics.attended
    // client_services no ROM pode estar incompleto vs Avec (metrics).
    // Nunca deixar appointments < attended (quebra comparecimento/vagas).
    if (scheduled >= attended && scheduled > 0) {
      // Live coerente: usa CS. Se metrics Avec tem mais agenda (mesmo lag leve), prefer metrics
      // — no-shows/cancel vêm de metrics; CS incompleto distorce comparecimento/vagas.
      if (metricAppt >= attended && metricAppt > scheduled) {
        todayMetrics.appointments = metricAppt
      } else {
        todayMetrics.appointments = scheduled
      }
    } else if (metricAppt >= attended && metricAppt > 0) {
      todayMetrics.appointments = metricAppt
    } else {
      todayMetrics.appointments = Math.max(scheduled, metricAppt, attended)
    }

    // Vagas 2h só no dia corrente (janela wall-clock).
    if (!isHistorical) {
      const next2h = (await sql`
        select count(*)::int as n
        from client_services
        where active = true
          and scheduled_at is not null
          and scheduled_at >= now()
          and scheduled_at < now() + interval '2 hours'
      `) as { n: number }[]
      appointmentsNext2h = n(next2h[0]?.n)
      slotsNext2hKnown = true
    }
  } catch {
    slotsNext2hKnown = false
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
      // Sanitiza todos os dias do MTD — dump de novos num dia antigo inflava o mês.
      sanitizeDayMix(row, capacity, capacitySet)
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
