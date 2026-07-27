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
  /**
   * false quando a agenda do dia veio de metrics Avec (client_services incompleto).
   * Nesse caso appointmentsNext2h/openSlotsNext2h não são confiáveis.
   */
  slotsNext2hKnown: boolean
  newShare: number
}

/** Gestão — Avec 0021, 0126, 0032, 0107, 0003 + 0007, 0017 */
export interface OpsWeek {
  professionals: { name: string; revenue: number; attended: number; ticketAvg: number; occupancy: number }[]
  services: { name: string; quantity: number; revenue: number }[]
  acquisition: { channel: string; clients: number }[]
  reactivationCount: number | null
  /** null quando P3 não trouxe taxa (não inventar 0%). */
  returnRate: number | null
  /** null quando P3 ausente (não inventar “0 novos”). */
  newClientsPeriod: number | null
}

/** Comercial leve — Avec 0056, 0061, 0104, 0001 (sem despesas manuais) */
export interface OpsCommerce {
  bookingChannels: { channel: string; count: number }[]
  packages: { name: string; quantity: number; revenue: number }[]
  packagesSold: number
  packagesRevenue: number
  /** false quando P2 comercial ausente — não inventar R$0 de pacotes. */
  packagesKnown: boolean
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
  /** null quando sem atendidos MTD (não inventar ticket R$0). */
  mtdTicketAvg: number | null
  cmv: number
  /** true só quando a query de saídas (0044) rodou com sucesso. */
  cmvKnown: boolean
  /** CMV ÷ receita MTD — null se sem receita ou CMV desconhecido. */
  cmvShare: number | null
  paymentsTotal: number
  /** true só quando há linhas P2/0081 no MTD. */
  paymentsKnown: boolean
  paymentReconcile: PaymentReconcileStatus
  topPaymentMethod: string | null
  available: boolean
}

/** Estoque Avec-only — posição 0149 + alertas + drift vs 0045 quando existir. */
export interface OpsStock {
  available: boolean
  /** true quando há valorização real (custo local ou 0045 oficial). */
  valueKnown: boolean
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
    /** partial = sync Avec incompleto mas dados ainda usáveis. */
    status: 'ok' | 'partial' | 'stale' | 'error'
    lastSyncAt: string
    label: string
    /** true quando a unidade não respondeu (placeholder no painel). */
    offline?: boolean
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
    /** Há unidade com movimento hoje (meta/ocupação do dia fazem sentido). */
    todayOpsActive: boolean
    /** Há unidade com receita ou atendido hoje (% meta / gap de dinheiro). */
    todayMoneyActive: boolean
    mtdRevenue: number
    mtdGoal: number
    mtdGoalProgress: number
    /** Ticket médio do mês (receita MTD ÷ atendidos MTD). null sem atendidos. */
    mtdTicketAvg: number | null
    attendanceRate: number
    noShowRate: number
    occupancyRate: number
    /** false se nenhuma unidade com agenda tem capacidade definida. */
    occupancyConfigured: boolean
    /** true quando há agenda confiável o bastante para comparecimento/no-show. */
    attendanceConfigured: boolean
    /** Ticket médio do dia (rede em operação). */
    ticketAvg: number
    /** null quando há no-shows sem ticket (não inventar R$0 em risco). */
    revenueAtRisk: number | null
    newClients: number
    returningClients: number
    conversionRate: number
    openSlotsToday: number
    openSlotsNext2h: number
    /** true quando há unidade com capacity + agenda 2h confiável (CS live). */
    slotsNext2hConfigured: boolean
    cancelledToday: number
    noShowsToday: number
    newShare: number
    /** CMV rede (Avec) no MTD. */
    cmv: number
    /** false quando nenhuma unidade tem saídas 0044 no período. */
    cmvKnown: boolean
    cmvShare: number | null
    stockValue: number
    stockAlerts: number
    /** true quando há unidade legível com posição de estoque Disponível. */
    stockKnown: boolean
    /** true quando há valorização real (não SKUs sem custo → R$0). */
    stockValueKnown: boolean
    /**
     * true quando há ≥1 unidade legível (não offline / não token morto).
     * Sem isso, todayRevenue/mtdRevenue=0 seria inventar mês zerado.
     */
    networkReadable: boolean
  }
  units: UnitSnapshot[]
  /** null = unidade offline naquele dia (não plotar como zero). */
  trend30: { day: string; brasil: number | null; iguatemi: number | null }[]
  /** Próximas ações (alerta + leitura), ordenadas por severidade */
  nextActions: AlertItem[]
  /** Ausente quando só uma unidade está disponível (mock sempre tem as duas). */
  comparison?: UnitComparison
}
