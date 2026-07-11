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

/** Ação do dia — derivados de today + agenda 2h */
export interface OpsToday {
  openSlotsToday: number
  appointmentsNext2h: number
  capacityNext2h: number
  openSlotsNext2h: number
  newShare: number
}

/** Gestão — Avec 0021, 0126, 0032, 0107, 0003 + 0007, 0017 */
export interface OpsWeek {
  professionals: { name: string; revenue: number; attended: number; ticketAvg: number; occupancy: number }[]
  services: { name: string; quantity: number; revenue: number }[]
  acquisition: { channel: string; clients: number }[]
  reactivationCount: number
  returnRate: number
  newClientsPeriod: number
}

/** Comercial leve — Avec 0056, 0061, 0104, 0001 (sem mix pagamento) */
export interface OpsCommerce {
  bookingChannels: { channel: string; count: number }[]
  packages: { name: string; quantity: number; revenue: number }[]
  packagesSold: number
  ratingsAvg: number
  ratingsCount: number
  birthdayCount: number
}

export interface UnitSnapshot {
  unit: UnitMeta
  today: DayMetrics
  opsToday: OpsToday
  opsWeek: OpsWeek
  opsCommerce: OpsCommerce
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

/** Quem lidera cada métrica entre as unidades — só existe com as duas ao vivo. */
export interface UnitComparison {
  revenueLeader: UnitSlug
  occupancyLeader: UnitSlug
  attendanceLeader: UnitSlug
  ticketLeader: UnitSlug
  /**
   * MTD Brasil vs Iguatemi: positivo = Brasil à frente.
   * null = não dá pra expressar como %: uma unidade faturou e a outra
   * está zerada no período (divisão por zero seria infinita/enganosa).
   */
  deltaRevenuePct: number | null
}

export interface CerebroOverview {
  generatedAt: string
  mode: 'mock' | 'live' | 'degraded'
  partial?: boolean
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
    returningClients: number
    conversionRate: number
    openSlotsToday: number
    openSlotsNext2h: number
    cancelledToday: number
    noShowsToday: number
    newShare: number
  }
  units: UnitSnapshot[]
  trend30: { day: string; brasil: number; iguatemi: number }[]
  /** Próximas ações (alerta + leitura), ordenadas por severidade */
  nextActions: AlertItem[]
  /** Ausente quando só uma unidade está disponível (mock sempre tem as duas). */
  comparison?: UnitComparison
}
