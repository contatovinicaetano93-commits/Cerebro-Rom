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

/** P0 — operação do dia (Avec 0051 / 0052 / 0002 + métricas ROM). */
export interface OpsP0 {
  /** Horários ainda livres hoje (capacidade − agendados) */
  openSlotsToday: number
  /** Agendamentos nas próximas ~2h (encaixe imediato) */
  appointmentsNext2h: number
  /** Capacidade estimada nas próximas 2h */
  capacityNext2h: number
  /** Vagas estimadas nas próximas 2h */
  openSlotsNext2h: number
  /** Cancelamentos do dia (Avec 0052) */
  cancelledToday: number
  /** No-shows do dia */
  noShowsToday: number
  /** Novos clientes do dia */
  newClientsToday: number
  /** Recorrentes do dia */
  returningClientsToday: number
  /** Share novos (0–1) entre novos+recorrentes */
  newShare: number
  /** Fonte Avec dos cancelamentos */
  cancelSource: string
}

export interface UnitSnapshot {
  unit: UnitMeta
  today: DayMetrics
  opsP0: OpsP0
  mtd: {
    revenue: number
    attended: number
    noShows: number
    appointments: number
    newClients: number
    returningClients: number
    cancelled: number
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
  mode: 'mock' | 'live' | 'fallback'
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
    /** P0 consolidado */
    openSlotsToday: number
    openSlotsNext2h: number
    cancelledToday: number
    noShowsToday: number
    returningClients: number
    newShare: number
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
