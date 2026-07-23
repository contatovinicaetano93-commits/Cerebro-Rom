import ExcelJS from 'exceljs'
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

function modeLabel(mode: CerebroOverview['mode'], partial?: boolean): string {
  if (mode === 'live') return partial ? 'Live parcial (só unidades online)' : 'Live (Neons das unidades)'
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

function lostRevenue(u: UnitSnapshot): number {
  return Math.round((u.today.noShows + u.today.cancelled) * u.today.ticketAvg)
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
  ['Sync', 'Saúde do sync Avec → Neon da unidade (atraso/erro).'],
  ['Δ%', 'Variação Iguatemi vs Brasil: (IG − BR) ÷ |BR|.'],
  ['Modo live', 'Números lidos dos Neons. Zeros podem ser dia sem movimento OU sync fraco.'],
  ['Modo degradado', 'Live indisponível — o Cérebro não inventa KPIs.'],
]

function capaRows(run: ReportRunDetail): (string | number | null)[][] {
  const o = run.payload
  const notes: string[] = []
  if (o.mode === 'degraded') notes.push('Live indisponível — trate zeros com cautela.')
  if (o.partial) notes.push('Totais parciais: alguma unidade offline.')
  if (o.mode === 'live' && o.consolidated.todayRevenue === 0 && o.consolidated.mtdRevenue > 0) {
    notes.push('Faturamento hoje = R$ 0 com MTD > 0: dia sem venda ainda OU sync do dia atrasado.')
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
    ['Modo', modeLabel(o.mode, o.partial)],
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
    ['2.', 'Unidades = detalhe por salão.'],
    ['3.', 'Comparativo = Brasil × Iguatemi × Δ%.'],
    ['4.', 'Legenda = significado de cada indicador.'],
  ]
}

function redeMetricRows(o: CerebroOverview): (string | number | null)[][] {
  const c = o.consolidated
  return [
    ['Indicador', 'Valor', 'Unidade / formato', 'Como ler'],
    [
      'Faturamento hoje',
      money(c.todayRevenue),
      'R$',
      'Receita Avec do dia (unidades ao vivo).',
    ],
    [
      'Meta hoje',
      c.goalsConfigured ? money(c.todayGoal) : '— (meta não definida)',
      'R$',
      'Definida no painel Metas.',
    ],
    [
      '% meta hoje',
      c.goalsConfigured ? pct(c.todayGoalProgress) : '—',
      '%',
      'Faturamento ÷ meta.',
    ],
    ['MTD (mês)', money(c.mtdRevenue), 'R$', 'Receita acumulada no mês.'],
    ['Ticket médio (hoje)', money(c.ticketAvg), 'R$', 'Receita ÷ atendidos.'],
    ['Ocupação', pct(c.occupancyRate), '%', 'Agenda ÷ capacidade.'],
    ['Comparecimento', pct(c.attendanceRate), '%', 'Atendidos ÷ agendados.'],
    ['No-show', pct(c.noShowRate), '%', 'Faltas ÷ agendados.'],
    ['Receita em risco', money(c.revenueAtRisk), 'R$', 'No-shows × ticket.'],
    ['Vagas hoje', num(c.openSlotsToday), 'qtd', 'Capacidade − agenda do dia.'],
    ['Vagas 2h', num(c.openSlotsNext2h), 'qtd', 'Encaixes estimados nas próximas 2h.'],
    ['Cancelamentos (hoje)', num(c.cancelledToday), 'qtd', 'Cancelamentos Avec do dia.'],
    ['No-shows (qtd)', num(c.noShowsToday), 'qtd', 'Faltas do dia.'],
    ['CMV (mês)', money(c.cmv), 'R$', 'Saídas estoque 0044.'],
    ['CMV / receita', pct(c.cmvShare), '%', 'CMV ÷ MTD.'],
    ['Estoque (valor)', money(c.stockValue), 'R$', 'Posição Avec.'],
    ['Alertas estoque', num(c.stockAlerts), 'qtd', 'Abaixo do mínimo.'],
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
    'Estoque (R$)',
    'Alertas estoque',
    'Zerados',
    'Sync',
  ]
  const rows = o.units.map((u) => [
    u.unit.short,
    u.today.day,
    money(u.today.revenue),
    num(u.today.appointments),
    num(u.today.attended),
    num(u.today.noShows),
    num(u.today.cancelled),
    money(u.today.ticketAvg),
    u.today.capacitySet ? num(u.today.capacity) : '—',
    u.today.goalSet ? money(u.today.dailyGoal) : '—',
    money(lostRevenue(u)),
    num(u.opsToday.openSlotsToday),
    num(u.opsToday.openSlotsNext2h),
    money(u.opsFinance.mtdRevenue),
    money(u.opsFinance.mtdTicketAvg),
    money(u.opsFinance.cmv),
    money(u.opsFinance.paymentsTotal),
    reconcileLabel(u.opsFinance.paymentReconcile),
    u.opsFinance.topPaymentMethod || '—',
    money(u.opsCommerce.packagesRevenue),
    pct(u.opsWeek.returnRate),
    money(u.opsStock.totalValue),
    num(u.opsStock.activeAlerts),
    num(u.opsStock.zeroProducts),
    u.sync.label || u.sync.status,
  ])
  return [header, ...rows]
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
        ? 'Δ% positivo = Iguatemi acima (melhor)'
        : 'Δ% negativo = Iguatemi abaixo (melhor neste KPI)',
  ])
  return [header, ...rows]
}

/** CSV BR (;) — capa + legenda + rede + unidades + comparativo. UTF-8 com BOM. */
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

  // BOM ajuda Excel/Numbers a reconhecer UTF-8 e acentos.
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

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
