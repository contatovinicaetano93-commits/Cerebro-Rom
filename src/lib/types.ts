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
  /** Meta diária definida no Cérebro (ou env bootstrap). */
  goalSet: boolean
  /** Capacidade definida no Cérebro (ou env bootstrap). */
  capacitySet: boolean
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

/** Comercial leve — Avec 0056, 0061, 0104, 0001 (sem despesas manuais) */
export interface OpsCommerce {
  bookingChannels: { channel: string; count: number }[]
  packages: { name: string; quantity: number; revenue: number }[]
  packagesSold: number
  packagesRevenue: number
  ratingsAvg: number
  ratingsCount: number
  birthdayCount: number
  topBookingChannel: string | null
}

export type PaymentReconcileStatus =
  | 'aligned'
  | 'divergent'
  | 'missing_payments'
  | 'missing_revenue'
  | 'unknown'

/**
 * Financeiro Avec-only (sem despesas manuais).
 * Receita/ticket = salon_daily_metrics · CMV = saídas 0044 · mix = 0081 via P2.
 */
export interface OpsFinance {
  mtdRevenue: number
  mtdAttended: number
  mtdTicketAvg: number
  cmv: number
  /** CMV ÷ receita MTD — null se sem receita. */
  cmvShare: number | null
  paymentsTotal: number
  paymentReconcile: PaymentReconcileStatus
  topPaymentMethod: string | null
  available: boolean
}

/** Estoque Avec-only — posição 0149 + alertas + drift vs 0045 quando existir. */
export interface OpsStock {
  available: boolean
  totalValue: number
  productCount: number
  activeAlerts: number
  zeroProducts: number
  drift: number | null
}

export interface UnitSnapshot {
  unit: UnitMeta
  today: DayMetrics
  opsToday: OpsToday
  opsWeek: OpsWeek
  opsCommerce: OpsCommerce
  opsFinance: OpsFinance
  opsStock: OpsStock
  mtd: {
    revenue: number
    attended: number
    noShows: number
    appointments: number
    newClients: number
    returningClients: number
    cancelled: number
    goal: number
    goalSet: boolean
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

export type ComparisonGroup = 'ops' | 'comercial' | 'financeiro' | 'estoque'
export type ComparisonFormat = 'currency' | 'pct' | 'number' | 'text'

/** Linha do scorecard Brasil × Iguatemi × Δ%. */
export interface ComparisonRow {
  key: string
  label: string
  group: ComparisonGroup
  brasil: number | null
  iguatemi: number | null
  /** Rótulo textual (ex.: forma de pagamento / status 0081). */
  brasilText?: string | null
  iguatemiText?: string | null
  /** (brasil − iguatemi) / |iguatemi|; null se não comparável. */
  deltaPct: number | null
  format: ComparisonFormat
  /** Se true, valor maior é melhor (pinta Δ). */
  higherIsBetter: boolean
}

export interface UnitComparison {
  rows: ComparisonRow[]
  /**
   * MTD Brasil vs Iguatemi: positivo = Brasil à frente.
   * null = não dá pra expressar como % (denominador zero).
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
    /** false até Waltter preencher metas no painel (ou env). */
    goalsConfigured: boolean
    mtdRevenue: number
    mtdGoal: number
    mtdGoalProgress: number
    attendanceRate: number
    noShowRate: number
    occupancyRate: number
    /** false se nenhuma unidade tem capacidade definida. */
    occupancyConfigured: boolean
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
    /** CMV rede (Avec) no MTD. */
    cmv: number
    cmvShare: number | null
    stockValue: number
    stockAlerts: number
  }
  units: UnitSnapshot[]
  trend30: { day: string; brasil: number; iguatemi: number }[]
  /** Próximas ações (alerta + leitura), ordenadas por severidade */
  nextActions: AlertItem[]
  /** Ausente quando só uma unidade está disponível (mock sempre tem as duas). */
  comparison?: UnitComparison
}
