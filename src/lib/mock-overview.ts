import type {
  AlertItem,
  CerebroOverview,
  DayMetrics,
  DecisionInsight,
  UnitMeta,
  UnitSlug,
  UnitSnapshot,
} from '@/lib/types'
import { clamp01 } from '@/lib/format'

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
  professionals: UnitSnapshot['topProfessionals'],
  sync: UnitSnapshot['sync'],
): UnitSnapshot {
  const last30 = buildSeries(slug, capacity, dailyGoal, baseRevenue)
  const today = last30[last30.length - 1]!
  const mtdDays = last30.slice(-Math.min(9, last30.length))

  return {
    unit: UNITS[slug],
    today,
    mtd: {
      revenue: sumField(mtdDays, 'revenue'),
      attended: sumField(mtdDays, 'attended'),
      noShows: sumField(mtdDays, 'noShows'),
      appointments: sumField(mtdDays, 'appointments'),
      newClients: sumField(mtdDays, 'newClients'),
      goal: monthlyGoal,
    },
    last30,
    topProfessionals: professionals,
    sync,
  }
}

function rate(num: number, den: number): number {
  if (den <= 0) return 0
  return clamp01(num / den)
}

export function buildMockOverview(): CerebroOverview {
  const brasil = buildUnit(
    'rom-brasil',
    18,
    6200,
    155000,
    4800,
    [
      { id: 'b1', name: 'Camila R.', revenue: 28400, attended: 62, ticketAvg: 458, occupancy: 0.91 },
      { id: 'b2', name: 'Diego M.', revenue: 24100, attended: 55, ticketAvg: 438, occupancy: 0.84 },
      { id: 'b3', name: 'Larissa P.', revenue: 19800, attended: 49, ticketAvg: 404, occupancy: 0.78 },
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
      { id: 'i1', name: 'Sofia A.', revenue: 22100, attended: 48, ticketAvg: 460, occupancy: 0.88 },
      { id: 'i2', name: 'Bruno T.', revenue: 18700, attended: 44, ticketAvg: 425, occupancy: 0.81 },
      { id: 'i3', name: 'Nina V.', revenue: 15200, attended: 39, ticketAvg: 390, occupancy: 0.74 },
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
  const leads = units.reduce((a, u) => a + u.today.leads, 0)
  const converted = units.reduce((a, u) => a + u.today.converted, 0)
  const ticketAvg =
    attended > 0 ? Math.round(todayRevenue / attended) : 0
  const revenueAtRisk = units.reduce(
    (a, u) => a + u.today.noShows * u.today.ticketAvg,
    0,
  )

  const trend30 = brasil.last30.map((row, idx) => {
    const other = iguatemi.last30[idx]!
    return {
      day: row.day.slice(5),
      brasil: row.revenue,
      iguatemi: other.revenue,
      total: row.revenue + other.revenue,
    }
  })

  const deltaRevenuePct =
    iguatemi.mtd.revenue > 0
      ? (brasil.mtd.revenue - iguatemi.mtd.revenue) / iguatemi.mtd.revenue
      : 0

  const alerts: AlertItem[] = [
    {
      id: 'a1',
      severity: 'warning',
      unit: 'rom-iguatemi',
      title: 'Sync Avec atrasado no Iguatemi',
      detail: 'Última sincronização há mais de 3 horas. KPIs do dia podem estar incompletos.',
      action: 'Rodar sync manual ou checar cron / token Avec',
    },
    {
      id: 'a2',
      severity: 'critical',
      unit: 'rom-brasil',
      title: 'No-show acima do limite',
      detail: `${brasil.today.noShows} no-shows hoje · risco estimado de ${Math.round(brasil.today.noShows * brasil.today.ticketAvg)} em receita.`,
      action: 'Priorizar remarcação e confirmação WhatsApp nas próximas 2h',
    },
    {
      id: 'a3',
      severity: 'info',
      unit: 'both',
      title: 'Meta consolidada do dia em aberto',
      detail: `Faltam ${Math.max(0, todayGoal - todayRevenue).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })} para bater a meta das duas unidades.`,
      action: 'Olhar horários vagos e upsell nos atendimentos restantes',
    },
  ]

  const decisions: DecisionInsight[] = [
    {
      id: 'd1',
      title: 'Brasil puxa o consolidado',
      detail: `ROM Brasil está ${Math.abs(deltaRevenuePct * 100).toFixed(0)}% à frente do Iguatemi no MTD. Vale replicar o mix de serviços e a grade de horários do Brasil no Iguatemi.`,
      impact: 'Receita MTD',
    },
    {
      id: 'd2',
      title: 'Ocupação com folga no Iguatemi',
      detail: `Capacidade ${iguatemi.today.capacity} · agendados ${iguatemi.today.appointments}. Há espaço para campanha rápida de encaixe (lista de espera / WhatsApp).`,
      impact: 'Ocupação',
    },
    {
      id: 'd3',
      title: 'Ticket médio saudável nas duas',
      detail: `Ticket consolidado ~${ticketAvg.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}. Manter foco em retenção e pacotes, não só volume.`,
      impact: 'Margem',
    },
  ]

  return {
    generatedAt: new Date().toISOString(),
    mode: 'mock',
    periodLabel: 'Hoje + MTD (mock realista)',
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
      revenueAtRisk,
      newClients,
      conversionRate: rate(converted, leads),
    },
    units,
    comparison: {
      revenueLeader: brasil.mtd.revenue >= iguatemi.mtd.revenue ? 'rom-brasil' : 'rom-iguatemi',
      occupancyLeader:
        rate(brasil.today.appointments, brasil.today.capacity) >=
        rate(iguatemi.today.appointments, iguatemi.today.capacity)
          ? 'rom-brasil'
          : 'rom-iguatemi',
      attendanceLeader:
        rate(brasil.today.attended, brasil.today.appointments) >=
        rate(iguatemi.today.attended, iguatemi.today.appointments)
          ? 'rom-brasil'
          : 'rom-iguatemi',
      ticketLeader:
        brasil.today.ticketAvg >= iguatemi.today.ticketAvg ? 'rom-brasil' : 'rom-iguatemi',
      deltaRevenuePct,
    },
    trend30,
    alerts,
    decisions,
  }
}
