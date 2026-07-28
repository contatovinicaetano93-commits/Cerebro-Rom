import type { getSql } from '@/lib/db'
import type { OpsCommerce, OpsWeek } from '@/lib/types'

function n(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const x = Number(v)
    return Number.isFinite(x) ? x : 0
  }
  // postgres.js / drivers às vezes devolvem Numeric como objeto.
  if (typeof v === 'bigint') return Number(v)
  if (v != null && typeof v === 'object') {
    const x = Number(String(v))
    return Number.isFinite(x) ? x : 0
  }
  return 0
}

function asArray(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v != null ? String(v) : ''
}

type Sql = ReturnType<typeof getSql>

async function tableExists(sql: Sql, name: string): Promise<boolean> {
  try {
    const rows = (await sql`
      select to_regclass(${`public.${name}`}) is not null as ok
    `) as { ok: boolean }[]
    return Boolean(rows[0]?.ok)
  } catch {
    return false
  }
}

function parseProfessionals(raw: unknown): OpsWeek['professionals'] {
  return asArray(raw)
    .map((row) => {
      const name = str(row.name)
      if (!name) return null
      const attended = n(row.attended)
      const revenue = n(row.revenue)
      const ticketRaw = n(row.ticket_avg ?? row.ticketAvg)
      return {
        name,
        revenue: Math.round(revenue),
        attended,
        ticketAvg: Math.round(ticketRaw > 0 ? ticketRaw : attended > 0 ? revenue / attended : 0),
        occupancy: n(row.occupancy),
      }
    })
    .filter((x): x is OpsWeek['professionals'][number] => x != null)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
}

function parseServices(raw: unknown): OpsWeek['services'] {
  return asArray(raw)
    .map((row) => {
      const name = str(row.name)
      if (!name) return null
      return {
        name,
        quantity: n(row.quantity),
        revenue: Math.round(n(row.revenue)),
      }
    })
    .filter((x): x is OpsWeek['services'][number] => x != null)
    .slice(0, 5)
}

function parseAcquisition(raw: unknown): OpsWeek['acquisition'] {
  return asArray(raw)
    .map((row) => {
      const channel = str(row.channel)
      if (!channel) return null
      return { channel, clients: n(row.clients) }
    })
    .filter((x): x is OpsWeek['acquisition'][number] => x != null)
    .slice(0, 5)
}

function parseBookingChannels(raw: unknown): OpsCommerce['bookingChannels'] {
  return asArray(raw)
    .map((row) => {
      const channel = str(row.channel)
      if (!channel) return null
      return { channel, count: n(row.count) }
    })
    .filter((x): x is OpsCommerce['bookingChannels'][number] => x != null)
    .slice(0, 5)
}

function parsePackages(raw: unknown): OpsCommerce['packages'] {
  return asArray(raw)
    .map((row) => {
      const name = str(row.name)
      if (!name) return null
      return {
        name,
        quantity: n(row.quantity),
        revenue: Math.round(n(row.revenue)),
      }
    })
    .filter((x): x is OpsCommerce['packages'][number] => x != null)
    .slice(0, 5)
}

export const EMPTY_OPS_WEEK: OpsWeek = {
  professionals: [],
  services: [],
  acquisition: [],
  reactivationCount: null,
  returnRate: null,
  newClientsPeriod: null,
  asOfDay: null,
  returnAsOfDay: null,
}

export const EMPTY_OPS_COMMERCE: OpsCommerce = {
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
}

type P1Row = {
  day?: unknown
  professionals?: unknown
  services?: unknown
  acquisition?: unknown
  reactivation_count?: unknown
}

type P2Row = {
  day?: unknown
  booking_channels?: unknown
  packages?: unknown
  packages_sold?: unknown
  ratings_avg?: unknown
  ratings_count?: unknown
  birthday_count?: unknown
}

type P3Row = {
  day?: unknown
  return_rate?: unknown
  new_clients_period?: unknown
}

function dayIso(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

async function fetchLatestP1(sql: Sql, today: string): Promise<P1Row | null> {
  if (!(await tableExists(sql, 'salon_p1_daily'))) return null
  try {
    // Prefere o dia mais recente com ranking de profissionais (evita [] de sync parcial).
    const rows = (await sql`
      select day::text as day, professionals, services, acquisition, reactivation_count
      from salon_p1_daily
      where day <= ${today}::date
        and day >= (${today}::date - interval '14 days')
        and jsonb_typeof(coalesce(professionals, '[]'::jsonb)) = 'array'
        and jsonb_array_length(coalesce(professionals, '[]'::jsonb)) > 0
      order by day desc
      limit 1
    `) as P1Row[]
    if (rows[0]) return rows[0]
    const fallback = (await sql`
      select day::text as day, professionals, services, acquisition, reactivation_count
      from salon_p1_daily
      where day <= ${today}::date
        and day >= (${today}::date - interval '14 days')
      order by day desc
      limit 1
    `) as P1Row[]
    return fallback[0] ?? null
  } catch {
    return null
  }
}

async function fetchLatestP2(sql: Sql, today: string): Promise<P2Row | null> {
  if (!(await tableExists(sql, 'salon_p2_daily'))) return null
  try {
    // Prefere dia com canais/pacotes/notas — evita linha só do 0081 (payment_mix)
    // que zera o comercial do dia e esconde o snapshot full anterior.
    const rows = (await sql`
      select
        day::text as day,
        booking_channels,
        packages,
        packages_sold,
        ratings_avg,
        ratings_count,
        birthday_count
      from salon_p2_daily
      where day <= ${today}::date
        and day >= (${today}::date - interval '14 days')
        and (
          (
            jsonb_typeof(coalesce(booking_channels, '[]'::jsonb)) = 'array'
            and jsonb_array_length(coalesce(booking_channels, '[]'::jsonb)) > 0
          )
          or (
            jsonb_typeof(coalesce(packages, '[]'::jsonb)) = 'array'
            and jsonb_array_length(coalesce(packages, '[]'::jsonb)) > 0
          )
          or coalesce(ratings_count, 0) > 0
        )
      order by day desc
      limit 1
    `) as P2Row[]
    if (rows[0]) return rows[0]
    const fallback = (await sql`
      select
        day::text as day,
        booking_channels,
        packages,
        packages_sold,
        ratings_avg,
        ratings_count,
        birthday_count
      from salon_p2_daily
      where day <= ${today}::date
        and day >= (${today}::date - interval '14 days')
      order by day desc
      limit 1
    `) as P2Row[]
    return fallback[0] ?? null
  } catch {
    return null
  }
}

async function fetchLatestP3(sql: Sql, today: string): Promise<P3Row | null> {
  if (!(await tableExists(sql, 'salon_p3_daily'))) return null
  try {
    // Prefere dia com taxa de retorno preenchida (evita zero de sync parcial).
    // Janela 30d: P3 full costuma ser raro (BR às vezes só no fim de semana).
    const rows = (await sql`
      select day::text as day, return_rate::float as return_rate, new_clients_period
      from salon_p3_daily
      where day <= ${today}::date
        and day >= (${today}::date - interval '30 days')
        and return_rate is not null
        and return_rate > 0
      order by day desc
      limit 1
    `) as P3Row[]
    if (rows[0]) return rows[0]
    const fallback = (await sql`
      select day::text as day, return_rate::float as return_rate, new_clients_period
      from salon_p3_daily
      where day <= ${today}::date
        and day >= (${today}::date - interval '30 days')
      order by day desc
      limit 1
    `) as P3Row[]
    return fallback[0] ?? null
  } catch {
    return null
  }
}

/**
 * Fallback quando salon_p3_daily.return_rate está vazio (ex.: IG cutover / 0007 lista).
 * Mix MTD: returning / (returning + new) em salon_daily_metrics.
 */
async function fetchReturnRateFromDailyMix(
  sql: Sql,
  monthStart: string,
  today: string,
): Promise<number | null> {
  if (!(await tableExists(sql, 'salon_daily_metrics'))) return null
  try {
    const rows = (await sql`
      select
        coalesce(sum(returning_clients), 0)::int as returning_clients,
        coalesce(sum(new_clients), 0)::int as new_clients
      from salon_daily_metrics
      where day >= ${monthStart}::date
        and day <= ${today}::date
    `) as { returning_clients: number; new_clients: number }[]
    const returning = n(rows[0]?.returning_clients)
    const neu = n(rows[0]?.new_clients)
    const denom = returning + neu
    if (denom <= 0 || returning <= 0) return null
    return Math.round((returning / denom) * 10000) / 10000
  } catch {
    return null
  }
}

export async function fetchOpsWeek(
  sql: Sql,
  today: string,
  monthStart?: string,
): Promise<OpsWeek> {
  const [p1, p3] = await Promise.all([fetchLatestP1(sql, today), fetchLatestP3(sql, today)])
  if (!p1 && !p3) return EMPTY_OPS_WEEK

  let returnRate =
    p3?.return_rate == null || n(p3.return_rate) <= 0 ? null : n(p3.return_rate)
  let returnAsOfDay = dayIso(p3?.day)

  // IG: P3 frequentemente null/0 — não deixar comparativo em "—".
  if (returnRate == null && monthStart) {
    const fromMix = await fetchReturnRateFromDailyMix(sql, monthStart, today)
    if (fromMix != null && fromMix > 0) {
      returnRate = fromMix
      returnAsOfDay = today
    }
  }

  return {
    professionals: parseProfessionals(p1?.professionals),
    services: parseServices(p1?.services),
    acquisition: parseAcquisition(p1?.acquisition),
    reactivationCount: p1 == null || p1.reactivation_count == null ? null : n(p1.reactivation_count),
    returnRate,
    newClientsPeriod:
      p3 == null || p3.new_clients_period == null ? null : n(p3.new_clients_period),
    asOfDay: dayIso(p1?.day),
    returnAsOfDay,
  }
}

export async function fetchOpsCommerce(sql: Sql, today: string): Promise<OpsCommerce> {
  const p2 = await fetchLatestP2(sql, today)
  if (!p2) return EMPTY_OPS_COMMERCE

  const bookingChannels = parseBookingChannels(p2.booking_channels)
  // Lista curta na UI; receita soma TODOS os pacotes do JSON (não só o top exibido).
  const packagesAll = asArray(p2.packages)
    .map((row) => {
      const name = str(row.name)
      if (!name) return null
      return { name, quantity: n(row.quantity), revenue: Math.round(n(row.revenue)) }
    })
    .filter((x): x is OpsCommerce['packages'][number] => x != null)
  const packages = packagesAll.slice(0, 5)
  const packagesRevenue = packagesAll.reduce((a, p) => a + p.revenue, 0)
  // P2 default packages_sold=0 — só known com venda real ou lista 0061.
  const packagesKnown = packagesAll.length > 0 || n(p2.packages_sold) > 0

  return {
    bookingChannels,
    packages,
    packagesSold: packagesKnown ? n(p2.packages_sold) : 0,
    packagesRevenue: packagesKnown ? packagesRevenue : 0,
    packagesKnown,
    ratingsAvg: n(p2.ratings_avg),
    ratingsCount: n(p2.ratings_count),
    birthdayCount: n(p2.birthday_count),
    topBookingChannel: bookingChannels[0]?.channel ?? null,
    asOfDay: dayIso(p2.day),
  }
}
