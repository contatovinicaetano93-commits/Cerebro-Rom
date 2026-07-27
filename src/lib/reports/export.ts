import ExcelJS from 'exceljs'
import { hasTrustedAgenda, isSalonActiveToday, isSyncHardFail, isUnitReadable } from '@/lib/salon-day'
import type { CerebroOverview, ComparisonRow, UnitSnapshot } from '@/lib/types'
import type { ReportRunDetail } from '@/lib/reports/store'

/** Separador decimal BR + milhar. */
function money(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

function num(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

/** `rate` em fração 0–1 → "55,0%". */
function pct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${(value * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`
}

function signedPct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const p = value * 100
  const body = p.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  return `${p > 0 ? '+' : ''}${body}%`
}

function csvEscape(value: string | number | null | undefined): string {
  if (value == null) return ''
  const s = String(value)
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function joinCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvEscape).join(';')).join('\n')
}

function modeLabel(mode: CerebroOverview['mode'], partial?: boolean, overview?: CerebroOverview): string {
  if (mode === 'live') {
    if (!partial) return 'Live (Brasil + Iguatemi Supabase)'
    const offline = overview?.units.some((u) => u.sync.offline)
    const syncBad = overview?.units.some(
      (u) => !u.sync.offline && (u.sync.status === 'partial' || u.sync.status === 'error'),
    )
    const unreadable = overview?.units.some((u) => !isUnitReadable(u))
    if (offline) return 'Live parcial (unidade offline)'
    if (syncBad) return 'Live parcial (sync incompleto)'
    if (unreadable) return 'Live parcial (unidade ilegível)'
    return 'Live parcial'
  }
  if (mode === 'degraded') return 'Degradado — live indisponível (sem inventar número)'
  return 'Mock / demonstração'
}

function reconcileLabel(status: string): string {
  switch (status) {
    case 'aligned':
      return 'Alinhado (0081 ≈ receita)'
    case 'divergent':
      return 'Divergente (gap relevante)'
    case 'missing_payments':
      return 'Sem pagamentos 0081'
    case 'missing_revenue':
      return 'Sem receita MTD'
    case 'unknown':
      return 'Indisponível'
    default:
      return status || '—'
  }
}

function groupLabel(group: string): string {
  switch (group) {
    case 'ops':
      return 'Operação'
    case 'comercial':
      return 'Comercial'
    case 'financeiro':
      return 'Financeiro Avec'
    case 'estoque':
      return 'Estoque Avec'
    default:
      return group
  }
}

function formatCmpSide(row: ComparisonRow, side: 'brasil' | 'iguatemi'): string {
  if (row.format === 'text') {
    const text = side === 'brasil' ? row.brasilText : row.iguatemiText
    return text?.trim() ? text : '—'
  }
  const value = side === 'brasil' ? row.brasil : row.iguatemi
  if (value == null || !Number.isFinite(value)) return '—'
  switch (row.format) {
    case 'currency':
      return money(value)
    case 'pct':
      return pct(value)
    case 'number':
      return num(value)
    default: {
      const _exhaustive: never = row.format
      return String(_exhaustive)
    }
  }
}

function lostRevenue(u: UnitSnapshot): number | null {
  const lost = u.today.noShows + u.today.cancelled
  if (lost <= 0) return 0
  if (u.today.ticketAvg <= 0) return null
  return Math.round(lost * u.today.ticketAvg)
}

const LEGEND_ROWS: [string, string][] = [
  ['Faturamento hoje', 'Soma da receita Avec do dia nas unidades ao vivo.'],
  ['Meta hoje', 'Meta diária definida no painel (Metas). Sem meta → progresso vazio.'],
  ['% meta hoje', 'Faturamento hoje ÷ meta hoje.'],
  ['MTD', 'Month-to-date: receita acumulada no mês corrente (Avec).'],
  ['Ticket', 'Receita ÷ atendidos (hoje). — se não houver atendidos.'],
  ['Ocupação', 'Agendamentos ÷ capacidade (Metas).'],
  ['Comparecimento', 'Atendidos ÷ agendamentos do dia.'],
  ['No-show %', 'Faltas ÷ agendamentos do dia.'],
  ['Receita em risco', 'No-shows × ticket médio (potencial perdido por falta).'],
  ['Receita perdida', '(Cancelamentos + no-shows) × ticket do dia.'],
  ['Vagas hoje', 'Capacidade do dia − agendamentos do dia.'],
  ['Vagas 2h', 'Estimativa: (capacidade÷8)×2 − agenda nas próximas 2h.'],
  ['CMV', 'Custo das saídas de estoque no mês (Avec 0044) — proxy de CMV.'],
  ['CMV/receita', 'CMV ÷ receita MTD.'],
  ['Pagamentos 0081', 'Soma das formas de pagamento (relatório Avec 0081).'],
  ['Conciliação', 'Status 0081 vs receita MTD (ideal ≈ alinhado).'],
  ['Forma #1', 'Forma de pagamento com maior volume no período.'],
  ['Pacotes', 'Receita de pacotes (Avec 0061).'],
  ['Retorno', 'Taxa de retorno de clientes (Avec / P3).'],
  ['Estoque valor', 'Valor da posição de estoque sincronizada da Avec.'],
  ['Alertas estoque', 'Produtos abaixo do mínimo (alertas ativos).'],
  ['Zerados', 'SKUs com saldo zero.'],
  ['Sync', 'Saúde do sync Avec → DB da unidade (atraso/erro).'],
  ['Δ%', 'Moeda/contagem: (BR − IG) ÷ |IG| (positivo = Brasil à frente). Taxas: pontos percentuais.'],
  [
    'Modo live',
    'Números lidos dos DBs das unidades. Zeros podem ser dia sem movimento OU sync fraco.',
  ],
  ['Modo degradado', 'Live indisponível — o Cérebro não inventa KPIs.'],
]

function capaRows(run: ReportRunDetail): (string | number | null)[][] {
  const o = run.payload
  const notes: string[] = []
  if (o.mode === 'degraded') notes.push('Live indisponível — trate zeros com cautela.')
  if (o.partial) {
    if (o.units.some((u) => u.sync.offline)) {
      notes.push('Totais parciais: alguma unidade offline.')
    } else {
      notes.push('Totais parciais: sync incompleto/com erro em alguma unidade.')
    }
  }
  if (
    o.mode === 'live' &&
    o.consolidated.networkReadable &&
    o.consolidated.todayRevenue === 0 &&
    o.consolidated.mtdRevenue > 0
  ) {
    notes.push('Faturamento hoje = R$ 0 com MTD > 0: dia sem venda ainda OU sync do dia atrasado.')
  }
  if (/MTD até a data/i.test(o.periodLabel)) {
    notes.push(
      'Captura histórica: KPIs do dia + MTD até a data escolhida. Estoque, sync e vagas 2h refletem o momento da captura.',
    )
  }
  for (const u of o.units) {
    if (u.sync.status !== 'ok') {
      notes.push(`${u.unit.short}: sync ${u.sync.label || u.sync.status}.`)
    }
  }

  return [
    ['Cérebro ROM — Relatório executivo'],
    ['ROM Brasil + ROM Iguatemi'],
    [],
    ['Capturado em', new Date(run.createdAt).toLocaleString('pt-BR')],
    ['Período', run.periodLabel],
    ['Modo', modeLabel(o.mode, o.partial, o)],
    ['Unidades no snapshot', o.units.length],
    ['Separador CSV', 'ponto-e-vírgula (;) — Excel/Numbers BR'],
    ['Números', 'padrão brasileiro: milhar com ponto, decimal com vírgula'],
    [],
    ['Avisos de leitura'],
    ...(notes.length
      ? notes.map((n, i) => [`${i + 1}.`, n])
      : [['—', 'Nenhum aviso no momento do snapshot.']]),
    [],
    ['Como usar'],
    ['1.', 'Aba/seção Rede = consolidado da rede.'],
    ['2.', 'Unidades = detalhe por salão (dia + MTD).'],
    ['3.', 'Comparativo = Brasil × Iguatemi × Δ%.'],
    ['4.', 'Alertas / Tendência / Semana / Comercial = camadas do painel.'],
    ['5.', 'Legenda = significado de cada indicador.'],
  ]
}

function redeMetricRows(o: CerebroOverview): (string | number | null)[][] {
  const c = o.consolidated
  return [
    ['Indicador', 'Valor', 'Unidade / formato', 'Como ler'],
    [
      'Faturamento hoje',
      c.networkReadable ? money(c.todayRevenue) : '—',
      'R$',
      'Receita Avec do dia (unidades com sync legível).',
    ],
    [
      'Meta hoje',
      c.goalsConfigured && c.todayMoneyActive ? money(c.todayGoal) : c.goalsConfigured ? '— (sem faturamento hoje)' : '— (meta/capacidade não definidas)',
      'R$',
      'Definida no painel Metas · só unidades com faturamento.',
    ],
    [
      '% meta hoje',
      c.goalsConfigured && c.todayMoneyActive ? pct(c.todayGoalProgress) : '—',
      '%',
      'Faturamento ÷ meta.',
    ],
    [
      'MTD (mês)',
      c.networkReadable ? money(c.mtdRevenue) : '—',
      'R$',
      'Receita acumulada no mês.',
    ],
    [
      'Meta MTD',
      c.networkReadable && c.goalsConfigured ? money(c.mtdGoal) : '—',
      'R$',
      'Meta diária × dias do mês até a data.',
    ],
    [
      '% meta MTD',
      c.networkReadable && c.goalsConfigured && c.mtdGoal > 0
        ? pct(c.mtdGoalProgress)
        : '—',
      '%',
      'MTD ÷ meta MTD.',
    ],
    [
      'Ticket MTD',
      c.networkReadable && c.mtdTicketAvg != null ? money(c.mtdTicketAvg) : '—',
      'R$',
      'Receita MTD ÷ atendidos MTD.',
    ],
    [
      'Ticket médio (hoje)',
      c.todayOpsActive && c.ticketAvg > 0 ? money(c.ticketAvg) : '—',
      'R$',
      'Receita ÷ atendidos (unidades com agenda).',
    ],
    [
      'Novos · Recorrentes (hoje)',
      c.todayOpsActive ? `${num(c.newClients)} · ${num(c.returningClients)}` : '—',
      'qtd',
      'Clientes novos vs recorrentes no dia.',
    ],
    [
      'Mix novos',
      c.todayOpsActive ? pct(c.newShare) : '—',
      '%',
      'Novos ÷ (novos + recorrentes).',
    ],
    [
      'Conversão leads',
      c.todayOpsActive && c.conversionRate > 0 ? pct(c.conversionRate) : '—',
      '%',
      'Leads convertidos ÷ leads do dia (quando houver).',
    ],
    [
      'Ocupação',
      c.occupancyConfigured ? pct(c.occupancyRate) : '—',
      '%',
      'Agenda ÷ capacidade (só unidades em operação).',
    ],
    [
      'Comparecimento',
      c.attendanceConfigured ? pct(c.attendanceRate) : '—',
      '%',
      'Atendidos ÷ agendados.',
    ],
    [
      'No-show',
      c.attendanceConfigured ? pct(c.noShowRate) : '—',
      '%',
      'Faltas ÷ agendados.',
    ],
    [
      'Receita em risco',
      c.attendanceConfigured && c.revenueAtRisk != null ? money(c.revenueAtRisk) : '—',
      'R$',
      'No-shows × ticket.',
    ],
    [
      'Vagas hoje',
      c.occupancyConfigured ? num(c.openSlotsToday) : '—',
      'qtd',
      'Capacidade − agenda (unidades em operação).',
    ],
    [
      'Vagas 2h',
      c.slotsNext2hConfigured ? num(c.openSlotsNext2h) : '—',
      'qtd',
      'Encaixes estimados nas próximas 2h (agenda live).',
    ],
    [
      'Cancelamentos (hoje)',
      c.todayOpsActive ? num(c.cancelledToday) : '—',
      'qtd',
      'Cancelamentos Avec do dia.',
    ],
    [
      'No-shows (qtd)',
      c.todayOpsActive ? num(c.noShowsToday) : '—',
      'qtd',
      'Faltas do dia.',
    ],
    [
      'CMV (mês)',
      c.cmvKnown ? money(c.cmv) : '—',
      'R$',
      'Saídas estoque 0044.',
    ],
    [
      'CMV / receita',
      c.cmvShare != null ? pct(c.cmvShare) : '—',
      '%',
      'CMV ÷ MTD.',
    ],
    [
      'Estoque (valor)',
      c.stockValueKnown ? money(c.stockValue) : '—',
      'R$',
      'Posição Avec.',
    ],
    [
      'Alertas estoque',
      c.stockKnown ? num(c.stockAlerts) : '—',
      'qtd',
      'Abaixo do mínimo.',
    ],
  ]
}

function unitTable(o: CerebroOverview): (string | number | null)[][] {
  const header = [
    'Unidade',
    'Dia',
    'Receita hoje (R$)',
    'Agendamentos',
    'Atendidos',
    'No-shows',
    'Cancelamentos',
    'Novos',
    'Recorrentes',
    'Ticket (R$)',
    'Capacidade',
    'Meta diária (R$)',
    'Receita perdida (R$)',
    'Vagas hoje',
    'Vagas 2h',
    'MTD (R$)',
    'Ticket MTD (R$)',
    'CMV (R$)',
    'Pagamentos 0081 (R$)',
    'Conciliação',
    'Forma #1',
    'Pacotes (R$)',
    'Retorno',
    'Novos período',
    'Sem retorno (90d)',
    'Estoque (R$)',
    'Alertas estoque',
    'Zerados',
    'Sync',
  ]
  const rows = o.units.map((u) => {
    const offline = Boolean(u.sync.offline)
    const hardFail = !offline && isSyncHardFail(u)
    const unreadable = offline || hardFail || !isUnitReadable(u)
    const active = !offline && isSalonActiveToday(u)
    if (unreadable) {
      return [
        u.unit.short,
        u.today.day,
        '—',
        '—',
        '—',
        '—',
        '—',
        '—',
        '—',
        '—',
        '—',
        '—',
        '—',
        '—',
        '—',
        '—',
        '—',
        '—',
        '—',
        '—',
        '—',
        '—',
        '—',
        '—',
        '—',
        '—',
        '—',
        '—',
        u.sync.label || (offline ? 'offline' : 'sync indisponível'),
      ]
    }
    return [
      u.unit.short,
      u.today.day,
      money(u.today.revenue),
      active ? num(u.today.appointments) : '—',
      active ? num(u.today.attended) : '—',
      active ? num(u.today.noShows) : '—',
      active ? num(u.today.cancelled) : '—',
      active ? num(u.today.newClients) : '—',
      active ? num(u.today.returningClients) : '—',
      active && u.today.attended > 0 ? money(u.today.ticketAvg) : '—',
      u.today.capacitySet ? num(u.today.capacity) : '—',
      u.today.goalSet ? money(u.today.dailyGoal) : '—',
      (() => {
        if (!active || !hasTrustedAgenda(u)) return '—'
        const lost = lostRevenue(u)
        return lost == null ? '—' : money(lost)
      })(),
      active && u.today.capacitySet && hasTrustedAgenda(u)
        ? num(u.opsToday.openSlotsToday)
        : '—',
      active && u.opsToday.slotsNext2hKnown && hasTrustedAgenda(u)
        ? num(u.opsToday.openSlotsNext2h)
        : '—',
      money(u.opsFinance.mtdRevenue),
      u.opsFinance.mtdTicketAvg != null ? money(u.opsFinance.mtdTicketAvg) : '—',
      u.opsFinance.cmvKnown ? money(u.opsFinance.cmv) : '—',
      u.opsFinance.paymentsKnown ? money(u.opsFinance.paymentsTotal) : '—',
      reconcileLabel(u.opsFinance.paymentReconcile),
      u.opsFinance.topPaymentMethod || '—',
      u.opsCommerce.packagesKnown ? money(u.opsCommerce.packagesRevenue) : '—',
      pct(u.opsWeek?.returnRate),
      u.opsWeek?.newClientsPeriod != null ? num(u.opsWeek.newClientsPeriod) : '—',
      u.opsWeek?.reactivationCount != null ? num(u.opsWeek.reactivationCount) : '—',
      u.opsStock.valueKnown ? money(u.opsStock.totalValue) : '—',
      u.opsStock.available ? num(u.opsStock.activeAlerts) : '—',
      u.opsStock.available ? num(u.opsStock.zeroProducts) : '—',
      u.sync.label || u.sync.status,
    ]
  })
  return [header, ...rows]
}

function actionsTable(o: CerebroOverview): (string | number | null)[][] {
  const header = ['Severidade', 'Unidade', 'Título', 'Detalhe', 'Ação']
  const actions = Array.isArray(o.nextActions) ? o.nextActions : []
  const rows = actions.map((a) => [
    a.severity,
    a.unit === 'both' ? 'Rede' : a.unit === 'rom-brasil' ? 'Brasil' : 'Iguatemi',
    a.title,
    a.detail,
    a.action,
  ])
  return [header, ...(rows.length ? rows : [['—', '—', 'Sem ações no snapshot', '', '']])]
}

function trendTable(o: CerebroOverview): (string | number | null)[][] {
  const header = ['Dia', 'Brasil (R$)', 'Iguatemi (R$)']
  const trend = Array.isArray(o.trend30) ? o.trend30 : []
  const rows = trend.map((t) => [
    t.day,
    t.brasil == null ? '—' : money(t.brasil),
    t.iguatemi == null ? '—' : money(t.iguatemi),
  ])
  return [header, ...rows]
}

function weekTable(o: CerebroOverview): (string | number | null)[][] {
  const header = [
    'Unidade',
    'Tipo',
    'Nome',
    'Receita (R$)',
    'Atendidos / Qtd',
    'Ticket (R$)',
    'Ocupação',
  ]
  const rows: (string | number | null)[][] = []
  for (const u of o.units ?? []) {
    if (u.sync.offline || isSyncHardFail(u) || !isUnitReadable(u)) continue
    const pros = u.opsWeek?.professionals ?? []
    const services = u.opsWeek?.services ?? []
    const acquisition = u.opsWeek?.acquisition ?? []
    for (const p of pros.slice(0, 10)) {
      rows.push([
        u.unit.short,
        'Profissional',
        p.name,
        money(p.revenue),
        num(p.attended),
        money(p.ticketAvg),
        pct(p.occupancy),
      ])
    }
    for (const s of services.slice(0, 10)) {
      rows.push([
        u.unit.short,
        'Serviço',
        s.name,
        money(s.revenue),
        num(s.quantity),
        '—',
        '—',
      ])
    }
    for (const a of acquisition.slice(0, 10)) {
      rows.push([u.unit.short, 'Aquisição', a.channel, '—', num(a.clients), '—', '—'])
    }
  }
  return [header, ...(rows.length ? rows : [['—', '—', 'Sem dados de semana no snapshot', '', '', '', '']])]
}

function commerceTable(o: CerebroOverview): (string | number | null)[][] {
  const header = [
    'Unidade',
    'Canal #1',
    'Pacotes (R$)',
    'Pacotes vendidos',
    'Nota média',
    'Avaliações',
    'Aniversários',
    'Pacote (detalhe)',
    'Qtd',
    'Receita pacote (R$)',
  ]
  const rows: (string | number | null)[][] = []
  for (const u of o.units ?? []) {
    if (u.sync.offline || isSyncHardFail(u) || !isUnitReadable(u)) continue
    const co = u.opsCommerce
    if (!co) continue
    const packList = Array.isArray(co.packages) ? co.packages : []
    const channels = Array.isArray(co.bookingChannels) ? co.bookingChannels : []
    const packs = co.packagesKnown ? packList.slice(0, 8) : []
    if (packs.length === 0) {
      rows.push([
        u.unit.short,
        co.topBookingChannel || '—',
        co.packagesKnown ? money(co.packagesRevenue) : '—',
        co.packagesKnown ? num(co.packagesSold) : '—',
        co.ratingsCount > 0 ? num(co.ratingsAvg, 1) : '—',
        co.ratingsCount > 0 ? num(co.ratingsCount) : '—',
        num(co.birthdayCount),
        '—',
        '—',
        '—',
      ])
      for (const ch of channels.slice(0, 5)) {
        rows.push([
          u.unit.short,
          `Canal: ${ch.channel}`,
          '—',
          '—',
          '—',
          '—',
          '—',
          '—',
          num(ch.count),
          '—',
        ])
      }
      continue
    }
    packs.forEach((p, idx) => {
      rows.push([
        u.unit.short,
        idx === 0 ? co.topBookingChannel || '—' : '',
        idx === 0 ? money(co.packagesRevenue) : '',
        idx === 0 ? num(co.packagesSold) : '',
        idx === 0 ? (co.ratingsCount > 0 ? num(co.ratingsAvg, 1) : '—') : '',
        idx === 0 ? (co.ratingsCount > 0 ? num(co.ratingsCount) : '—') : '',
        idx === 0 ? num(co.birthdayCount) : '',
        p.name,
        num(p.quantity),
        money(p.revenue),
      ])
    })
  }
  return [
    header,
    ...(rows.length ? rows : [['—', '—', 'Sem dados comerciais no snapshot', '', '', '', '', '', '', '']]),
  ]
}

function comparisonTable(o: CerebroOverview): (string | number | null)[][] | null {
  if (!o.comparison?.rows?.length) return null
  const header = ['KPI', 'Grupo', 'Brasil', 'Iguatemi', 'Δ%', 'Como ler Δ%']
  const rows = o.comparison.rows.map((r) => [
    r.label,
    groupLabel(r.group),
    formatCmpSide(r, 'brasil'),
    formatCmpSide(r, 'iguatemi'),
    r.format === 'text' ? '—' : signedPct(r.deltaPct),
    r.format === 'text'
      ? 'Comparativo textual (sem Δ%)'
      : r.higherIsBetter
        ? 'Δ% positivo = Brasil à frente (melhor)'
        : 'Δ% negativo = Brasil à frente (melhor neste KPI)',
  ])
  return [header, ...rows]
}

/** CSV BR (;) — capa + legenda + rede + unidades + comparativo + alertas + trend + semana + comercial. */
export function buildReportCsv(run: ReportRunDetail): string {
  const o = run.payload
  const blocks: string[] = []

  blocks.push(joinCsv(capaRows(run)))
  blocks.push('')
  blocks.push(joinCsv([['—— Legenda dos indicadores ——'], ['Indicador', 'Significado'], ...LEGEND_ROWS]))
  blocks.push('')
  blocks.push(joinCsv([['—— Consolidado da rede ——'], ...redeMetricRows(o)]))
  blocks.push('')
  blocks.push(joinCsv([['—— Por unidade ——'], ...unitTable(o)]))

  const cmp = comparisonTable(o)
  if (cmp) {
    blocks.push('')
    blocks.push(joinCsv([['—— Comparativo Brasil × Iguatemi ——'], ...cmp]))
  }

  blocks.push('')
  blocks.push(joinCsv([['—— Próximas ações / alertas ——'], ...actionsTable(o)]))
  blocks.push('')
  blocks.push(joinCsv([['—— Tendência receita 30 dias ——'], ...trendTable(o)]))
  blocks.push('')
  blocks.push(joinCsv([['—— Semana (pros / serviços / aquisição) ——'], ...weekTable(o)]))
  blocks.push('')
  blocks.push(joinCsv([['—— Comercial ——'], ...commerceTable(o)]))

  // BOM ajuda Excel/Numbers a reconhecer UTF-8 e acentos.
  return `\uFEFF${blocks.join('\n')}\n`
}

/** CSV só do comparativo Brasil × Iguatemi (MTD + dia + ops). */
export function buildComparativoCsv(run: ReportRunDetail): string {
  const o = run.payload
  const cmp = comparisonTable(o)
  if (!cmp) {
    return `\uFEFF${joinCsv([
      ['Comparativo Brasil × Iguatemi'],
      ['Período', o.periodLabel],
      ['Captura', run.createdAt],
      ['Status', 'Comparativo indisponível (faltou uma das unidades)'],
    ])}\n`
  }
  const blocks = [
    joinCsv([
      ['Comparativo Brasil × Iguatemi — relatório do mês (MTD) + dia'],
      ['Período', o.periodLabel],
      ['Captura', run.createdAt],
      ['Modo', modeLabel(o.mode, o.partial, o)],
      [
        'Δ receita MTD',
        o.comparison?.deltaRevenuePct == null
          ? '—'
          : signedPct(o.comparison.deltaRevenuePct),
      ],
    ]),
    '',
    joinCsv(cmp),
  ]
  return `\uFEFF${blocks.join('\n')}\n`
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FF1A1A1A' } }
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8D5A3' },
  }
}

function autosize(sheet: ExcelJS.Worksheet, min = 12, max = 48) {
  sheet.columns.forEach((col) => {
    let width = min
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? '').length
      width = Math.min(max, Math.max(width, len + 2))
    })
    col.width = width
  })
}

export async function buildReportXlsx(run: ReportRunDetail): Promise<Buffer> {
  const o = run.payload
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Cérebro ROM'
  wb.created = new Date(run.createdAt)
  wb.description = 'Snapshot executivo ROM Brasil + Iguatemi — formatação pt-BR'

  const capa = wb.addWorksheet('Capa')
  capa.addRows(capaRows(run))
  capa.getRow(1).font = { bold: true, size: 16 }
  capa.getRow(2).font = { italic: true, color: { argb: 'FF666666' } }
  capa.getColumn(1).width = 22
  capa.getColumn(2).width = 72

  const legenda = wb.addWorksheet('Legenda')
  legenda.addRow(['Indicador', 'Significado'])
  styleHeaderRow(legenda.getRow(1))
  for (const [k, v] of LEGEND_ROWS) legenda.addRow([k, v])
  autosize(legenda, 18, 70)

  const rede = wb.addWorksheet('Rede')
  const redeRows = redeMetricRows(o)
  rede.addRows(redeRows)
  styleHeaderRow(rede.getRow(1))
  autosize(rede, 14, 56)

  const units = wb.addWorksheet('Unidades')
  const uRows = unitTable(o)
  units.addRows(uRows)
  styleHeaderRow(units.getRow(1))
  autosize(units, 10, 28)
  units.views = [{ state: 'frozen', ySplit: 1 }]

  const cmp = comparisonTable(o)
  if (cmp) {
    const sheet = wb.addWorksheet('Comparativo')
    sheet.addRows(cmp)
    styleHeaderRow(sheet.getRow(1))
    autosize(sheet, 12, 42)
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
  }

  const alertas = wb.addWorksheet('Alertas')
  alertas.addRows(actionsTable(o))
  styleHeaderRow(alertas.getRow(1))
  autosize(alertas, 12, 48)

  const tendencia = wb.addWorksheet('Tendencia')
  tendencia.addRows(trendTable(o))
  styleHeaderRow(tendencia.getRow(1))
  autosize(tendencia, 10, 24)
  tendencia.views = [{ state: 'frozen', ySplit: 1 }]

  const semana = wb.addWorksheet('Semana')
  semana.addRows(weekTable(o))
  styleHeaderRow(semana.getRow(1))
  autosize(semana, 10, 36)
  semana.views = [{ state: 'frozen', ySplit: 1 }]

  const comercial = wb.addWorksheet('Comercial')
  comercial.addRows(commerceTable(o))
  styleHeaderRow(comercial.getRow(1))
  autosize(comercial, 10, 36)
  comercial.views = [{ state: 'frozen', ySplit: 1 }]

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}

/** XLSX só com capa + aba Comparativo (mês MTD + dia). */
export async function buildComparativoXlsx(run: ReportRunDetail): Promise<Buffer> {
  const o = run.payload
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Cérebro ROM'
  wb.created = new Date(run.createdAt)
  wb.description = 'Comparativo Brasil × Iguatemi — MTD + dia'

  const capa = wb.addWorksheet('Capa')
  capa.addRows([
    ['Comparativo Brasil × Iguatemi'],
    ['Relatório do mês (MTD) + indicadores do dia'],
    ['Período', o.periodLabel],
    ['Captura', run.createdAt],
    ['Modo', modeLabel(o.mode, o.partial, o)],
    [
      'Δ receita MTD',
      o.comparison?.deltaRevenuePct == null
        ? '—'
        : signedPct(o.comparison.deltaRevenuePct),
    ],
  ])
  capa.getRow(1).font = { bold: true, size: 16 }
  capa.getRow(2).font = { italic: true, color: { argb: 'FF666666' } }
  capa.getColumn(1).width = 22
  capa.getColumn(2).width = 56

  const cmp = comparisonTable(o)
  const sheet = wb.addWorksheet('Comparativo')
  if (cmp) {
    sheet.addRows(cmp)
    styleHeaderRow(sheet.getRow(1))
  } else {
    sheet.addRow(['Comparativo indisponível (faltou uma das unidades)'])
  }
  autosize(sheet, 12, 42)
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
