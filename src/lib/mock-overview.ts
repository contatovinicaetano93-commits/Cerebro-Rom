import type {
  CerebroOverview,
  DayMetrics,
  UnitMeta,
  UnitSlug,
  UnitSnapshot,
} from '@/lib/types'
import { leaderBy, rate } from '@/lib/comparison'

const UNITS: Record<UnitSlug, UnitMeta> = {
  'rom-brasil': {
    slug: 'rom-brasil',
    name: 'ROM Brasil',
    short: 'Brasil',
    accent: '#c4a35a',
  },
  'rom-iguatemi': {
    slug: 'rom-iguatemi',
    name: 'ROM Iguatemi',
    short: 'Iguatemi',
    accent: '#7eb8a8',
  },
}

function isoDaysBack(n: number): string {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function seeded(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function buildSeries(
  unit: UnitSlug,
  capacity: number,
  dailyGoal: number,
  baseRevenue: number,
): DayMetrics[] {
  const out: DayMetrics[] = []
  for (let i = 29; i >= 0; i--) {
    const day = isoDaysBack(i)
    const weekend = [0, 6].includes(new Date(`${day}T12:00:00`).getDay())
    const wave = 0.82 + seeded(i + (unit === 'rom-brasil' ? 1 : 40)) * 0.36
    const weekendBoost = weekend ? 1.18 : 1
    const revenue = Math.round(baseRevenue * wave * weekendBoost)
    const appointments = Math.round(capacity * (0.72 + seeded(i + 7) * 0.28))
    const noShows = Math.max(0, Math.round(appointments * (0.04 + seeded(i + 11) * 0.08)))
    const cancelled = Math.max(0, Math.round(appointments * (0.02 + seeded(i + 13) * 0.04)))
    const attended = Math.max(0, appointments - noShows - cancelled)
    const ticketAvg = attended > 0 ? Math.round(revenue / attended) : Math.round(baseRevenue / 10)
    const newClients = Math.round(2 + seeded(i + 17) * 5)
    const returningClients = Math.max(0, attended - newClients)
    const leads = Math.round(8 + seeded(i + 19) * 14)
    const converted = Math.round(leads * (0.18 + seeded(i + 23) * 0.22))

    out.push({
      day,
      revenue,
      appointments,
      attended,
      noShows,
      cancelled,
      newClients,
      returningClients,
      ticketAvg,
      capacity,
      dailyGoal,
      leads,
      converted,
    })
  }
  return out
}

function sumField(rows: DayMetrics[], key: keyof DayMetrics): number {
  return rows.reduce((acc, row) => acc + (Number(row[key]) || 0), 0)
}

function buildUnit(
  slug: UnitSlug,
  capacity: number,
  dailyGoal: number,
  monthlyGoal: number,
  baseRevenue: number,
  pros: { name: string; revenue: number; attended: number; ticketAvg: number; occupancy: number }[],
  sync: UnitSnapshot['sync'],
): UnitSnapshot {
  const last30 = buildSeries(slug, capacity, dailyGoal, baseRevenue)
  const today = last30[last30.length - 1]!
  const monthStart = `${today.day.slice(0, 8)}01`
  const mtdDays = last30.filter((d) => d.day >= monthStart)
  const capacityNext2h = Math.max(1, Math.round((capacity / 8) * 2))
  const appointmentsNext2h = Math.min(
    capacityNext2h,
    Math.round(capacityNext2h * (0.55 + seeded(slug === 'rom-brasil' ? 3 : 9) * 0.4)),
  )
  const mixBase = today.newClients + today.returningClients

  return {
    unit: UNITS[slug],
    today,
    opsToday: {
      openSlotsToday: Math.max(0, capacity - today.appointments),
      appointmentsNext2h,
      capacityNext2h,
      openSlotsNext2h: Math.max(0, capacityNext2h - appointmentsNext2h),
      newShare: mixBase > 0 ? today.newClients / mixBase : 0,
    },
    opsWeek: {
      professionals: pros,
      services:
        slug === 'rom-brasil'
          ? [
              { name: 'Corte + barba', quantity: 42, revenue: 12600 },
              { name: 'Coloração', quantity: 18, revenue: 9800 },
            ]
          : [
              { name: 'Corte feminino', quantity: 31, revenue: 10850 },
              { name: 'Escova', quantity: 28, revenue: 5600 },
            ],
      acquisition:
        slug === 'rom-brasil'
          ? [
              { channel: 'Indicação', clients: 14 },
              { channel: 'Instagram', clients: 9 },
            ]
          : [
              { channel: 'Shopping', clients: 11 },
              { channel: 'Indicação', clients: 8 },
            ],
      reactivationCount: slug === 'rom-brasil' ? 17 : 12,
      returnRate: slug === 'rom-brasil' ? 0.62 : 0.55,
      newClientsPeriod: slug === 'rom-brasil' ? 48 : 36,
    },
    opsCommerce: {
      bookingChannels:
        slug === 'rom-brasil'
          ? [
              { channel: 'WhatsApp', count: 48 },
              { channel: 'Online', count: 22 },
            ]
          : [
              { channel: 'Online', count: 31 },
              { channel: 'WhatsApp', count: 27 },
            ],
      packages:
        slug === 'rom-brasil'
          ? [{ name: 'Pacote corte', quantity: 12, revenue: 4800 }]
          : [{ name: 'Day spa', quantity: 9, revenue: 5400 }],
      packagesSold: slug === 'rom-brasil' ? 19 : 23,
      ratingsAvg: slug === 'rom-brasil' ? 4.7 : 4.5,
      ratingsCount: slug === 'rom-brasil' ? 38 : 29,
      birthdayCount: slug === 'rom-brasil' ? 11 : 8,
    },
    mtd: {
      revenue: sumField(mtdDays, 'revenue'),
      attended: sumField(mtdDays, 'attended'),
      noShows: sumField(mtdDays, 'noShows'),
      appointments: sumField(mtdDays, 'appointments'),
      newClients: sumField(mtdDays, 'newClients'),
      returningClients: sumField(mtdDays, 'returningClients'),
      cancelled: sumField(mtdDays, 'cancelled'),
      goal: monthlyGoal,
    },
    last30,
    sync,
  }
}

export function buildMockOverview(): CerebroOverview {
  const brasil = buildUnit(
    'rom-brasil',
    18,
    6200,
    155000,
    4800,
    [
      { name: 'Camila R.', revenue: 28400, attended: 62, ticketAvg: 458, occupancy: 0.91 },
      { name: 'Diego M.', revenue: 24100, attended: 55, ticketAvg: 438, occupancy: 0.84 },
    ],
    {
      status: 'ok',
      lastSyncAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      label: 'Avec sync há 12 min',
    },
  )

  const iguatemi = buildUnit(
    'rom-iguatemi',
    14,
    5100,
    128000,
    3900,
    [
      { name: 'Sofia A.', revenue: 22100, attended: 48, ticketAvg: 460, occupancy: 0.88 },
      { name: 'Bruno T.', revenue: 18700, attended: 44, ticketAvg: 425, occupancy: 0.81 },
    ],
    {
      status: 'stale',
      lastSyncAt: new Date(Date.now() - 3.5 * 60 * 60 * 1000).toISOString(),
      label: 'Avec sync atrasado (3h+)',
    },
  )

  const units = [brasil, iguatemi]
  const todayRevenue = units.reduce((a, u) => a + u.today.revenue, 0)
  const todayGoal = units.reduce((a, u) => a + u.today.dailyGoal, 0)
  const mtdRevenue = units.reduce((a, u) => a + u.mtd.revenue, 0)
  const mtdGoal = units.reduce((a, u) => a + u.mtd.goal, 0)
  const attended = units.reduce((a, u) => a + u.today.attended, 0)
  const appointments = units.reduce((a, u) => a + u.today.appointments, 0)
  const noShows = units.reduce((a, u) => a + u.today.noShows, 0)
  const capacity = units.reduce((a, u) => a + u.today.capacity, 0)
  const newClients = units.reduce((a, u) => a + u.today.newClients, 0)
  const returningClients = units.reduce((a, u) => a + u.today.returningClients, 0)
  const leads = units.reduce((a, u) => a + u.today.leads, 0)
  const converted = units.reduce((a, u) => a + u.today.converted, 0)
  const ticketAvg = attended > 0 ? Math.round(todayRevenue / attended) : 0
  const mixBase = newClients + returningClients
  const deltaRevenuePct =
    iguatemi.mtd.revenue > 0
      ? (brasil.mtd.revenue - iguatemi.mtd.revenue) / iguatemi.mtd.revenue
      : brasil.mtd.revenue > 0
        ? null // Iguatemi zerado, Brasil não — % não representa isso direito
        : 0

  return {
    generatedAt: new Date().toISOString(),
    mode: 'mock',
    periodLabel: 'Hoje + MTD (mock)',
    consolidated: {
      todayRevenue,
      todayGoal,
      todayGoalProgress: rate(todayRevenue, todayGoal),
      mtdRevenue,
      mtdGoal,
      mtdGoalProgress: rate(mtdRevenue, mtdGoal),
      attendanceRate: rate(attended, appointments),
      noShowRate: rate(noShows, appointments),
      occupancyRate: rate(appointments, capacity),
      ticketAvg,
      revenueAtRisk: units.reduce((a, u) => a + u.today.noShows * u.today.ticketAvg, 0),
      newClients,
      returningClients,
      conversionRate: rate(converted, leads),
      openSlotsToday: units.reduce((a, u) => a + u.opsToday.openSlotsToday, 0),
      openSlotsNext2h: units.reduce((a, u) => a + u.opsToday.openSlotsNext2h, 0),
      cancelledToday: units.reduce((a, u) => a + u.today.cancelled, 0),
      noShowsToday: noShows,
      newShare: mixBase > 0 ? newClients / mixBase : 0,
    },
    units,
    trend30: brasil.last30.map((row, idx) => ({
      day: row.day.slice(5),
      brasil: row.revenue,
      iguatemi: iguatemi.last30[idx]!.revenue,
    })),
    nextActions: [
      {
        id: 'a1',
        severity: 'warning',
        unit: 'rom-iguatemi',
        title: 'Sync atrasado — Iguatemi',
        detail: 'Última sincronização há mais de 3h',
        action: 'Rodar sync full',
      },
      {
        id: 'a2',
        severity: 'critical',
        unit: 'rom-brasil',
        title: 'No-show — Brasil',
        detail: `${brasil.today.noShows} no-shows hoje`,
        action: 'Remarcar nas próximas 2h',
      },
    ],
    comparison: {
      revenueLeader: leaderBy(units, (u) => u.mtd.revenue),
      occupancyLeader: leaderBy(units, (u) => rate(u.today.appointments, u.today.capacity)),
      attendanceLeader: leaderBy(units, (u) => rate(u.today.attended, u.today.appointments)),
      ticketLeader: leaderBy(units, (u) => u.today.ticketAvg),
      deltaRevenuePct,
    },
  }
}
