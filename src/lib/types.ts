export type UnitSlug = 'rom-brasil' | 'rom-iguatemi'

export interface UnitMeta {
  slug: UnitSlug
  name: string
  short: string
  accent: string
}

export interface DayMetrics {
  day: string
  revenue: number
  appointments: number
  attended: number
  noShows: number
  cancelled: number
  newClients: number
  returningClients: number
  ticketAvg: number
  capacity: number
  dailyGoal: number
  leads: number
  converted: number
}

export interface UnitSnapshot {
  unit: UnitMeta
  today: DayMetrics
  mtd: {
    revenue: number
    attended: number
    noShows: number
    appointments: number
    newClients: number
    goal: number
  }
  last30: DayMetrics[]
  topProfessionals: {
    id: string
    name: string
    revenue: number
    attended: number
    ticketAvg: number
    occupancy: number
  }[]
  sync: {
    status: 'ok' | 'stale' | 'error'
    lastSyncAt: string
    label: string
  }
}

export interface AlertItem {
  id: string
  severity: 'critical' | 'warning' | 'info'
  unit: UnitSlug | 'both'
  title: string
  detail: string
  action: string
}

export interface DecisionInsight {
  id: string
  title: string
  detail: string
  impact: string
}

export interface CerebroOverview {
  generatedAt: string
  mode: 'mock' | 'live'
  periodLabel: string
  consolidated: {
    todayRevenue: number
    todayGoal: number
    todayGoalProgress: number
    mtdRevenue: number
    mtdGoal: number
    mtdGoalProgress: number
    attendanceRate: number
    noShowRate: number
    occupancyRate: number
    ticketAvg: number
    revenueAtRisk: number
    newClients: number
    conversionRate: number
  }
  units: UnitSnapshot[]
  comparison: {
    revenueLeader: UnitSlug
    occupancyLeader: UnitSlug
    attendanceLeader: UnitSlug
    ticketLeader: UnitSlug
    deltaRevenuePct: number
  }
  trend30: {
    day: string
    brasil: number
    iguatemi: number
    total: number
  }[]
  alerts: AlertItem[]
  decisions: DecisionInsight[]
}
