import type { getSql } from '@/lib/db'
import type { OpsCommerce, OpsWeek } from '@/lib/types'

function n(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const x = Number(v)
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
    .slice(0, 5)
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
  reactivationCount: 0,
  returnRate: 0,
  newClientsPeriod: 0,
}

export const EMPTY_OPS_COMMERCE: OpsCommerce = {
  bookingChannels: [],
  packages: [],
  packagesSold: 0,
  ratingsAvg: 0,
  ratingsCount: 0,
  birthdayCount: 0,
}

type P1Row = {
  professionals?: unknown
  services?: unknown
  acquisition?: unknown
  reactivation_count?: unknown
}

type P2Row = {
  booking_channels?: unknown
  packages?: unknown
  packages_sold?: unknown
  ratings_avg?: unknown
  ratings_count?: unknown
  birthday_count?: unknown
}

type P3Row = {
  return_rate?: unknown
  new_clients_period?: unknown
}

async function fetchLatestP1(sql: Sql, today: string): Promise<P1Row | null> {
  if (!(await tableExists(sql, 'salon_p1_daily'))) return null
  try {
    const rows = (await sql`
      select professionals, services, acquisition, reactivation_count
      from salon_p1_daily
      where day <= ${today}::date
      order by day desc
      limit 1
    `) as P1Row[]
    return rows[0] ?? null
  } catch {
    return null
  }
}

async function fetchLatestP2(sql: Sql, today: string): Promise<P2Row | null> {
  if (!(await tableExists(sql, 'salon_p2_daily'))) return null
  try {
    const rows = (await sql`
      select
        booking_channels,
        packages,
        packages_sold,
        ratings_avg,
        ratings_count,
        birthday_count
      from salon_p2_daily
      where day <= ${today}::date
      order by day desc
      limit 1
    `) as P2Row[]
    return rows[0] ?? null
  } catch {
    return null
  }
}

async function fetchLatestP3(sql: Sql, today: string): Promise<P3Row | null> {
  if (!(await tableExists(sql, 'salon_p3_daily'))) return null
  try {
    const rows = (await sql`
      select return_rate, new_clients_period
      from salon_p3_daily
      where day <= ${today}::date
      order by day desc
      limit 1
    `) as P3Row[]
    return rows[0] ?? null
  } catch {
    return null
  }
}

export async function fetchOpsWeek(sql: Sql, today: string): Promise<OpsWeek> {
  const [p1, p3] = await Promise.all([fetchLatestP1(sql, today), fetchLatestP3(sql, today)])
  if (!p1 && !p3) return EMPTY_OPS_WEEK

  return {
    professionals: parseProfessionals(p1?.professionals),
    services: parseServices(p1?.services),
    acquisition: parseAcquisition(p1?.acquisition),
    reactivationCount: n(p1?.reactivation_count),
    returnRate: n(p3?.return_rate),
    newClientsPeriod: n(p3?.new_clients_period),
  }
}

export async function fetchOpsCommerce(sql: Sql, today: string): Promise<OpsCommerce> {
  const p2 = await fetchLatestP2(sql, today)
  if (!p2) return EMPTY_OPS_COMMERCE

  return {
    bookingChannels: parseBookingChannels(p2.booking_channels),
    packages: parsePackages(p2.packages),
    packagesSold: n(p2.packages_sold),
    ratingsAvg: n(p2.ratings_avg),
    ratingsCount: n(p2.ratings_count),
    birthdayCount: n(p2.birthday_count),
  }
}
