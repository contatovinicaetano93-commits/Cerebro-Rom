import ExcelJS from 'exceljs'
import type { CerebroOverview, ComparisonRow } from '@/lib/types'
import type { ReportRunDetail } from '@/lib/reports/store'
import { redeMtdKpis, unitMtdKpis } from '@/lib/reports/mtd-kpis'

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

function deltaPct(brasil: number | null, iguatemi: number | null): number | null {
  if (brasil == null || iguatemi == null) return null
  if (iguatemi === 0) return brasil === 0 ? 0 : null
  return (brasil - iguatemi) / Math.abs(iguatemi)
}

const LEGEND_ROWS: [string, string][] = [
  ['Período', 'Todos os KPIs operacionais/financeiros do relatório são MTD: dia 1 → dia escolhido.'],
  ['Receita MTD', 'Soma da receita Avec do mês até o dia do relatório.'],
  ['Meta MTD', 'Meta diária × dias decorridos no mês (painel Metas).'],
  ['% meta MTD', 'Receita MTD ÷ meta MTD.'],
  ['Ticket MTD', 'Receita MTD ÷ atendidos MTD.'],
  ['Agendamentos / Atendidos / No-shows / Cancel.', 'Somas do mês até o dia.'],
  ['Ocupação MTD', 'Agendamentos MTD ÷ (capacidade diária × dias do período).'],
  ['Comparecimento MTD', 'Atendidos MTD ÷ agendamentos MTD.'],
  ['No-show % MTD', 'Faltas MTD ÷ agendamentos MTD.'],
  ['Receita em risco MTD', 'No-shows MTD × ticket MTD.'],
  ['Receita perdida MTD', '(Cancel. + no-shows) MTD × ticket MTD.'],
  ['Vagas MTD', 'Soma (capacidade − agenda) nos dias do mês.'],
  ['Novos / Recorrentes', 'Somas MTD de salon_daily_metrics.'],
  ['Leads / Conversão', 'Contatos criados no mês até o dia; convertidos ÷ leads.'],
  ['CMV', 'Custo das saídas de estoque no mês (Avec 0044).'],
  ['CMV/receita', 'CMV ÷ receita MTD.'],
  ['Pagamentos 0081', 'Soma das formas de pagamento no MTD.'],
  ['Pacotes', 'Soma de pacotes (P2) no MTD.'],
  ['Retorno / Reativação', 'Último snapshot P3/P1 ≤ dia (taxa de período Avec, não soma diária).'],
  ['Estoque', 'Posição atual no momento da captura (não há série diária).'],
  ['Sync', 'Saúde do sync Avec → Neon no momento da captura.'],
  ['Δ%', 'Variação Iguatemi vs Brasil: (IG − BR) ÷ |BR|.'],
  ['Dia (referência)', 'Bloco opcional com KPIs só do dia escolhido — o corpo do relatório é MTD.'],
]

function capaRows(run: ReportRunDetail): (string | number | null)[][] {
  const o = run.payload
  const mtd = redeMtdKpis(o)
  const notes: string[] = []
  if (o.mode === 'degraded') notes.push('Live indisponível — trate zeros com cautela.')
  if (o.partial) notes.push('Totais parciais: alguma unidade offline.')
  if (o.mode === 'live' && mtd.revenue === 0) {
    notes.push('Receita MTD = R$ 0: mês sem movimento OU sync Avec fraco.')
  }
  for (const u of o.units) {
    if (u.sync.status !== 'ok') {
      notes.push(`${u.unit.short}: sync ${u.sync.label || u.sync.status}.`)
    }
  }

  return [
    ['Cérebro ROM — Relatório executivo (MTD)'],
    ['ROM Brasil + ROM Iguatemi'],
    [],
    ['Capturado em', new Date(run.createdAt).toLocaleString('pt-BR')],
    ['Período', run.periodLabel],
    ['MTD até', mtd.asOfDay],
    ['Dias no período', mtd.daysInPeriod],
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
    ['1.', 'Aba Graficos = tendência de receita + barras MTD.'],
    ['2.', 'Rede = consolidado MTD da rede.'],
    ['3.', 'Unidades = MTD por salão.'],
    ['4.', 'Comparativo = Brasil × Iguatemi em MTD.'],
    ['5.', 'Dia (referência) = só o dia escolhido, para contraste.'],
  ]
}

function redeMetricRows(o: CerebroOverview): (string | number | null)[][] {
  const c = redeMtdKpis(o)
  return [
    ['Indicador (MTD)', 'Valor', 'Unidade / formato', 'Como ler'],
    ['Receita MTD', money(c.revenue), 'R$', 'Acumulado do mês até o dia.'],
    [
      'Meta MTD',
      c.goalsConfigured ? money(c.goal) : '— (meta não definida)',
      'R$',
      'Meta diária × dias do período.',
    ],
    ['% meta MTD', c.goalsConfigured ? pct(c.goalProgress) : '—', '%', 'Receita ÷ meta MTD.'],
    ['Ticket médio MTD', money(c.ticketAvg), 'R$', 'Receita ÷ atendidos MTD.'],
    ['Agendamentos MTD', num(c.appointments), 'qtd', 'Soma do mês.'],
    ['Atendidos MTD', num(c.attended), 'qtd', 'Soma do mês.'],
    ['No-shows MTD', num(c.noShows), 'qtd', 'Soma do mês.'],
    ['Cancelamentos MTD', num(c.cancelled), 'qtd', 'Soma do mês.'],
    ['Ocupação MTD', pct(c.occupancyRate), '%', 'Agenda ÷ (capacidade × dias).'],
    ['Comparecimento MTD', pct(c.attendanceRate), '%', 'Atendidos ÷ agendados.'],
    ['No-show % MTD', pct(c.noShowRate), '%', 'Faltas ÷ agendados.'],
    ['Receita em risco MTD', money(c.revenueAtRisk), 'R$', 'No-shows × ticket MTD.'],
    ['Receita perdida MTD', money(c.lostRevenue), 'R$', '(Cancel. + no-shows) × ticket.'],
    ['Vagas MTD', num(c.openSlots), 'qtd', 'Soma capacidade − agenda.'],
    ['Novos clientes MTD', num(c.newClients), 'qtd', 'Soma do mês.'],
    ['Recorrentes MTD', num(c.returningClients), 'qtd', 'Soma do mês.'],
    ['Mix novos MTD', pct(c.newShare), '%', 'Novos ÷ (novos + recorrentes).'],
    ['Leads MTD', num(c.leads), 'qtd', 'Contatos criados no mês.'],
    ['Conversão MTD', pct(c.conversionRate), '%', 'Convertidos ÷ leads.'],
    ['CMV (mês)', money(c.cmv), 'R$', 'Saídas estoque 0044.'],
    ['CMV / receita', pct(c.cmvShare), '%', 'CMV ÷ receita MTD.'],
    ['Pagamentos 0081 MTD', money(c.paymentsTotal), 'R$', 'Soma formas de pagamento.'],
    ['Pacotes MTD', money(c.packagesRevenue), 'R$', 'Receita pacotes no mês.'],
    ['Pacotes vendidos MTD', num(c.packagesSold), 'qtd', 'Quantidade no mês.'],
    ['Reativações (P1)', num(c.reactivationCount), 'qtd', 'Snapshot P1 ≤ dia.'],
    ['Estoque (valor agora)', money(c.stockValue), 'R$', 'Posição na captura.'],
    ['Alertas estoque', num(c.stockAlerts), 'qtd', 'Abaixo do mínimo.'],
    ['SKUs zerados', num(c.zeroProducts), 'qtd', 'Saldo zero.'],
  ]
}

function unitTable(o: CerebroOverview): (string | number | null)[][] {
  const header = [
    'Unidade',
    'MTD até',
    'Dias',
    'Receita MTD (R$)',
    'Agendamentos MTD',
    'Atendidos MTD',
    'No-shows MTD',
    'Cancel. MTD',
    'Ticket MTD (R$)',
    'Meta MTD (R$)',
    '% meta MTD',
    'Ocupação MTD',
    'Comparecimento MTD',
    'No-show % MTD',
    'Receita perdida MTD (R$)',
    'Vagas MTD',
    'Novos MTD',
    'Recorrentes MTD',
    'Leads MTD',
    'Conversão MTD',
    'CMV (R$)',
    'Pagamentos 0081 (R$)',
    'Conciliação',
    'Forma #1',
    'Pacotes MTD (R$)',
    'Retorno',
    'Estoque agora (R$)',
    'Alertas',
    'Zerados',
    'Sync',
  ]
  const rows = o.units.map((u) => {
    const m = unitMtdKpis(u)
    return [
      u.unit.short,
      m.day,
      num(m.daysInPeriod),
      money(m.revenue),
      num(m.appointments),
      num(m.attended),
      num(m.noShows),
      num(m.cancelled),
      money(m.ticketAvg),
      m.goalSet ? money(m.goal) : '—',
      pct(m.goalProgress),
      pct(m.occupancyRate),
      pct(m.attendanceRate),
      pct(m.noShowRate),
      money(m.lostRevenue),
      num(m.openSlots),
      num(m.newClients),
      num(m.returningClients),
      num(m.leads),
      pct(m.conversionRate),
      money(m.cmv),
      money(m.paymentsTotal),
      reconcileLabel(m.paymentReconcile),
      m.topPaymentMethod || '—',
      money(m.packagesRevenue),
      pct(m.returnRate),
      money(m.stockValue),
      num(m.stockAlerts),
      num(m.zeroProducts),
      m.syncLabel,
    ]
  })
  return [header, ...rows]
}

function dayReferenceTable(o: CerebroOverview): (string | number | null)[][] {
  const header = [
    'Unidade',
    'Dia',
    'Receita dia (R$)',
    'Agendamentos',
    'Atendidos',
    'No-shows',
    'Cancelamentos',
    'Ticket dia (R$)',
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
  ])
  return [header, ...rows]
}

function mtdComparisonTable(o: CerebroOverview): (string | number | null)[][] | null {
  const brasilU = o.units.find((u) => u.unit.slug === 'rom-brasil')
  const iguatemiU = o.units.find((u) => u.unit.slug === 'rom-iguatemi')
  if (!brasilU || !iguatemiU) return null
  const b = unitMtdKpis(brasilU)
  const i = unitMtdKpis(iguatemiU)

  const rows: ComparisonRow[] = [
    {
      key: 'revenue_mtd',
      label: 'Receita MTD',
      group: 'ops',
      brasil: b.revenue,
      iguatemi: i.revenue,
      format: 'currency',
      higherIsBetter: true,
      deltaPct: deltaPct(b.revenue, i.revenue),
    },
    {
      key: 'goal_pct_mtd',
      label: '% meta MTD',
      group: 'ops',
      brasil: b.goalProgress,
      iguatemi: i.goalProgress,
      format: 'pct',
      higherIsBetter: true,
      deltaPct: deltaPct(b.goalProgress, i.goalProgress),
    },
    {
      key: 'occupancy_mtd',
      label: 'Ocupação MTD',
      group: 'ops',
      brasil: b.occupancyRate,
      iguatemi: i.occupancyRate,
      format: 'pct',
      higherIsBetter: true,
      deltaPct: deltaPct(b.occupancyRate, i.occupancyRate),
    },
    {
      key: 'noshow_mtd',
      label: 'No-show % MTD',
      group: 'ops',
      brasil: b.noShowRate,
      iguatemi: i.noShowRate,
      format: 'pct',
      higherIsBetter: false,
      deltaPct: deltaPct(b.noShowRate, i.noShowRate),
    },
    {
      key: 'attendance_mtd',
      label: 'Comparecimento MTD',
      group: 'ops',
      brasil: b.attendanceRate,
      iguatemi: i.attendanceRate,
      format: 'pct',
      higherIsBetter: true,
      deltaPct: deltaPct(b.attendanceRate, i.attendanceRate),
    },
    {
      key: 'lost_mtd',
      label: 'Receita perdida MTD',
      group: 'ops',
      brasil: b.lostRevenue,
      iguatemi: i.lostRevenue,
      format: 'currency',
      higherIsBetter: false,
      deltaPct: deltaPct(b.lostRevenue, i.lostRevenue),
    },
    {
      key: 'ticket_mtd',
      label: 'Ticket MTD',
      group: 'ops',
      brasil: b.ticketAvg || null,
      iguatemi: i.ticketAvg || null,
      format: 'currency',
      higherIsBetter: true,
      deltaPct: deltaPct(b.ticketAvg || null, i.ticketAvg || null),
    },
    {
      key: 'return',
      label: 'Taxa de retorno',
      group: 'comercial',
      brasil: b.returnRate || null,
      iguatemi: i.returnRate || null,
      format: 'pct',
      higherIsBetter: true,
      deltaPct: deltaPct(b.returnRate || null, i.returnRate || null),
    },
    {
      key: 'packages_mtd',
      label: 'Pacotes MTD',
      group: 'comercial',
      brasil: b.packagesRevenue,
      iguatemi: i.packagesRevenue,
      format: 'currency',
      higherIsBetter: true,
      deltaPct: deltaPct(b.packagesRevenue, i.packagesRevenue),
    },
    {
      key: 'cmv',
      label: 'CMV (mês)',
      group: 'financeiro',
      brasil: b.cmv,
      iguatemi: i.cmv,
      format: 'currency',
      higherIsBetter: false,
      deltaPct: deltaPct(b.cmv, i.cmv),
    },
    {
      key: 'cmv_share',
      label: 'CMV / receita',
      group: 'financeiro',
      brasil: b.cmvShare,
      iguatemi: i.cmvShare,
      format: 'pct',
      higherIsBetter: false,
      deltaPct: deltaPct(b.cmvShare, i.cmvShare),
    },
    {
      key: 'payments_mtd',
      label: 'Pagamentos 0081 MTD',
      group: 'financeiro',
      brasil: b.paymentsTotal,
      iguatemi: i.paymentsTotal,
      format: 'currency',
      higherIsBetter: true,
      deltaPct: deltaPct(b.paymentsTotal, i.paymentsTotal),
    },
    {
      key: 'stock',
      label: 'Estoque (agora)',
      group: 'estoque',
      brasil: b.stockValue,
      iguatemi: i.stockValue,
      format: 'currency',
      higherIsBetter: true,
      deltaPct: deltaPct(b.stockValue, i.stockValue),
    },
  ]

  const header = ['KPI (MTD)', 'Grupo', 'Brasil', 'Iguatemi', 'Δ%', 'Como ler Δ%']
  const body = rows.map((r) => [
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
  return [header, ...body]
}

/** CSV BR (;) — capa + legenda + rede MTD + unidades MTD + comparativo MTD + dia. UTF-8 com BOM. */
export function buildReportCsv(run: ReportRunDetail): string {
  const o = run.payload
  const blocks: string[] = []

  blocks.push(joinCsv(capaRows(run)))
  blocks.push('')
  blocks.push(joinCsv([['—— Legenda dos indicadores ——'], ['Indicador', 'Significado'], ...LEGEND_ROWS]))
  blocks.push('')
  blocks.push(joinCsv([['—— Consolidado da rede (MTD) ——'], ...redeMetricRows(o)]))
  blocks.push('')
  blocks.push(joinCsv([['—— Por unidade (MTD) ——'], ...unitTable(o)]))

  const cmp = mtdComparisonTable(o)
  if (cmp) {
    blocks.push('')
    blocks.push(joinCsv([['—— Comparativo Brasil × Iguatemi (MTD) ——'], ...cmp]))
  }

  blocks.push('')
  blocks.push(
    joinCsv([
      ['—— Dia de referência (não é o corpo do relatório) ——'],
      ...dayReferenceTable(o),
    ]),
  )

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
  wb.description = 'Snapshot executivo MTD ROM Brasil + Iguatemi — formatação pt-BR'

  const capa = wb.addWorksheet('Capa')
  capa.addRows(capaRows(run))
  capa.getRow(1).font = { bold: true, size: 16 }
  capa.getRow(2).font = { italic: true, color: { argb: 'FF666666' } }
  capa.getColumn(1).width = 22
  capa.getColumn(2).width = 72

  // Gráficos primeiro — visão rápida antes das tabelas.
  const charts = wb.addWorksheet('Graficos')
  charts.getColumn(1).width = 18
  charts.getCell('A1').value = 'Gráficos executivos (MTD)'
  charts.getCell('A1').font = { bold: true, size: 14 }
  charts.getCell('A2').value = run.periodLabel
  charts.getCell('A2').font = { italic: true, color: { argb: 'FF666666' } }
  charts.getCell('A3').value =
    '1) Receita diária Brasil × Iguatemi · 2) KPIs MTD (receita, atendidos, cancel., ticket, ocupação)'
  charts.getCell('A3').font = { size: 10, color: { argb: 'FF7A6A55' } }

  try {
    const { renderRevenueTrendPng, renderMtdBarsPng } = await import('@/lib/reports/charts')
    const [trendPng, barsPng] = await Promise.all([
      renderRevenueTrendPng(o),
      renderMtdBarsPng(o),
    ])
    const trendId = wb.addImage({ buffer: trendPng, extension: 'png' })
    const barsId = wb.addImage({ buffer: barsPng, extension: 'png' })
    charts.addImage(trendId, {
      tl: { col: 0, row: 4 },
      ext: { width: 720, height: 330 },
      editAs: 'oneCell',
    })
    charts.addImage(barsId, {
      tl: { col: 0, row: 22 },
      ext: { width: 720, height: 330 },
      editAs: 'oneCell',
    })
  } catch (e) {
    charts.getCell('A5').value =
      'Não foi possível gerar os gráficos neste ambiente: ' +
      (e instanceof Error ? e.message : String(e))
    charts.getCell('A5').font = { color: { argb: 'FFB45309' } }
  }

  // Dados das séries (para recriar gráfico nativo no Excel se quiser).
  const chartData = wb.addWorksheet('Dados grafico')
  chartData.addRow(['Dia', 'Brasil (R$)', 'Iguatemi (R$)'])
  styleHeaderRow(chartData.getRow(1))
  for (const row of o.trend30 ?? []) {
    chartData.addRow([row.day, row.brasil, row.iguatemi])
  }
  autosize(chartData, 12, 22)

  const legenda = wb.addWorksheet('Legenda')
  legenda.addRow(['Indicador', 'Significado'])
  styleHeaderRow(legenda.getRow(1))
  for (const [k, v] of LEGEND_ROWS) legenda.addRow([k, v])
  autosize(legenda, 18, 70)

  const rede = wb.addWorksheet('Rede MTD')
  const redeRows = redeMetricRows(o)
  rede.addRows(redeRows)
  styleHeaderRow(rede.getRow(1))
  autosize(rede, 14, 56)

  const units = wb.addWorksheet('Unidades MTD')
  const uRows = unitTable(o)
  units.addRows(uRows)
  styleHeaderRow(units.getRow(1))
  autosize(units, 10, 28)
  units.views = [{ state: 'frozen', ySplit: 1 }]

  const cmp = mtdComparisonTable(o)
  if (cmp) {
    const sheet = wb.addWorksheet('Comparativo MTD')
    sheet.addRows(cmp)
    styleHeaderRow(sheet.getRow(1))
    autosize(sheet, 12, 42)
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
  }

  const daySheet = wb.addWorksheet('Dia referência')
  daySheet.addRows(dayReferenceTable(o))
  styleHeaderRow(daySheet.getRow(1))
  autosize(daySheet, 10, 28)

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
