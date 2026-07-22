import ExcelJS from 'exceljs'
import type { CerebroOverview } from '@/lib/types'
import type { ReportRunDetail } from '@/lib/reports/store'
import { formatCurrency, formatPct, formatSignedPct } from '@/lib/format'

function csvEscape(value: string | number | null | undefined): string {
  if (value == null) return ''
  const s = String(value)
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function joinCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvEscape).join(';')).join('\n') + '\n'
}

/** CSV BR (separador ;) — rede + unidades + comparativo. */
export function buildReportCsv(run: ReportRunDetail): string {
  const o = run.payload
  const c = o.consolidated
  const blocks: string[] = []

  blocks.push(
    joinCsv([
      ['Relatório Cérebro'],
      ['Capturado em', run.createdAt],
      ['Período', run.periodLabel],
      ['Modo', run.mode],
      [],
      ['Consolidado rede'],
      ['Faturamento hoje', c.todayRevenue],
      ['Meta hoje', c.todayGoal],
      ['% meta hoje', formatPct(c.todayGoalProgress)],
      ['MTD', c.mtdRevenue],
      ['Ticket', c.ticketAvg],
      ['Ocupação', formatPct(c.occupancyRate)],
      ['Comparecimento', formatPct(c.attendanceRate)],
      ['No-show', formatPct(c.noShowRate)],
      ['Receita em risco', c.revenueAtRisk],
      ['Vagas hoje', c.openSlotsToday],
      ['Vagas 2h', c.openSlotsNext2h],
      ['Cancelamentos', c.cancelledToday],
      ['No-shows (qtd)', c.noShowsToday],
      ['CMV', c.cmv],
      ['CMV/receita', c.cmvShare != null ? formatPct(c.cmvShare) : ''],
      ['Estoque valor', c.stockValue],
      ['Alertas estoque', c.stockAlerts],
    ]),
  )

  const unitHeader = [
    'Unidade',
    'Dia',
    'Receita hoje',
    'Agendamentos',
    'Atendidos',
    'No-shows',
    'Cancelamentos',
    'Ticket',
    'Capacidade',
    'Meta diária',
    'Receita perdida',
    'Vagas hoje',
    'Vagas 2h',
    'MTD',
    'Ticket MTD',
    'CMV',
    'Pagamentos 0081',
    'Conciliação',
    'Forma #1',
    'Pacotes',
    'Retorno',
    'Estoque',
    'Alertas estoque',
    'Zerados',
    'Sync',
  ]

  const unitRows = o.units.map((u) => {
    const lost = Math.round((u.today.noShows + u.today.cancelled) * u.today.ticketAvg)
    return [
      u.unit.short,
      u.today.day,
      u.today.revenue,
      u.today.appointments,
      u.today.attended,
      u.today.noShows,
      u.today.cancelled,
      u.today.ticketAvg,
      u.today.capacity,
      u.today.dailyGoal,
      lost,
      u.opsToday.openSlotsToday,
      u.opsToday.openSlotsNext2h,
      u.opsFinance.mtdRevenue,
      u.opsFinance.mtdTicketAvg,
      u.opsFinance.cmv,
      u.opsFinance.paymentsTotal,
      u.opsFinance.paymentReconcile,
      u.opsFinance.topPaymentMethod,
      u.opsCommerce.packagesRevenue,
      formatPct(u.opsWeek.returnRate),
      u.opsStock.totalValue,
      u.opsStock.activeAlerts,
      u.opsStock.zeroProducts,
      u.sync.label,
    ]
  })

  blocks.push(joinCsv([unitHeader, ...unitRows]))

  if (o.comparison?.rows?.length) {
    const cmpHeader = ['KPI', 'Grupo', 'Brasil', 'Iguatemi', 'Δ%']
    const cmpRows = o.comparison.rows.map((r) => {
      const brasil =
        r.format === 'text'
          ? r.brasilText ?? ''
          : r.format === 'pct'
            ? formatPct(r.brasil)
            : r.format === 'currency'
              ? formatCurrency(r.brasil)
              : r.brasil
      const iguatemi =
        r.format === 'text'
          ? r.iguatemiText ?? ''
          : r.format === 'pct'
            ? formatPct(r.iguatemi)
            : r.format === 'currency'
              ? formatCurrency(r.iguatemi)
              : r.iguatemi
      return [r.label, r.group, brasil, iguatemi, formatSignedPct(r.deltaPct)]
    })
    blocks.push(joinCsv([cmpHeader, ...cmpRows]))
  }

  return blocks.join('\n')
}

export async function buildReportXlsx(run: ReportRunDetail): Promise<Buffer> {
  const o: CerebroOverview = run.payload
  const c = o.consolidated
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Cérebro ROM'
  wb.created = new Date(run.createdAt)

  const rede = wb.addWorksheet('Rede')
  rede.addRows([
    ['Relatório Cérebro'],
    ['Capturado em', run.createdAt],
    ['Período', run.periodLabel],
    ['Modo', run.mode],
    [],
    ['Indicador', 'Valor'],
    ['Faturamento hoje', c.todayRevenue],
    ['Meta hoje', c.todayGoal],
    ['% meta hoje', c.todayGoalProgress],
    ['MTD', c.mtdRevenue],
    ['Ticket', c.ticketAvg],
    ['Ocupação', c.occupancyRate],
    ['Comparecimento', c.attendanceRate],
    ['No-show', c.noShowRate],
    ['Receita em risco', c.revenueAtRisk],
    ['Vagas hoje', c.openSlotsToday],
    ['Vagas 2h', c.openSlotsNext2h],
    ['Cancelamentos', c.cancelledToday],
    ['No-shows (qtd)', c.noShowsToday],
    ['CMV', c.cmv],
    ['CMV/receita', c.cmvShare],
    ['Estoque valor', c.stockValue],
    ['Alertas estoque', c.stockAlerts],
  ])

  const units = wb.addWorksheet('Unidades')
  units.addRow([
    'Unidade',
    'Dia',
    'Receita hoje',
    'Agendamentos',
    'Atendidos',
    'No-shows',
    'Cancelamentos',
    'Ticket',
    'Capacidade',
    'Meta diária',
    'Receita perdida',
    'Vagas hoje',
    'Vagas 2h',
    'MTD',
    'Ticket MTD',
    'CMV',
    'Pagamentos 0081',
    'Conciliação',
    'Forma #1',
    'Pacotes',
    'Retorno',
    'Estoque',
    'Alertas',
    'Zerados',
    'Sync',
  ])
  for (const u of o.units) {
    const lost = Math.round((u.today.noShows + u.today.cancelled) * u.today.ticketAvg)
    units.addRow([
      u.unit.short,
      u.today.day,
      u.today.revenue,
      u.today.appointments,
      u.today.attended,
      u.today.noShows,
      u.today.cancelled,
      u.today.ticketAvg,
      u.today.capacity,
      u.today.dailyGoal,
      lost,
      u.opsToday.openSlotsToday,
      u.opsToday.openSlotsNext2h,
      u.opsFinance.mtdRevenue,
      u.opsFinance.mtdTicketAvg,
      u.opsFinance.cmv,
      u.opsFinance.paymentsTotal,
      u.opsFinance.paymentReconcile,
      u.opsFinance.topPaymentMethod,
      u.opsCommerce.packagesRevenue,
      u.opsWeek.returnRate,
      u.opsStock.totalValue,
      u.opsStock.activeAlerts,
      u.opsStock.zeroProducts,
      u.sync.label,
    ])
  }

  if (o.comparison?.rows?.length) {
    const cmp = wb.addWorksheet('Comparativo')
    cmp.addRow(['KPI', 'Grupo', 'Brasil', 'Iguatemi', 'Brasil texto', 'Iguatemi texto', 'Δ%'])
    for (const r of o.comparison.rows) {
      cmp.addRow([
        r.label,
        r.group,
        r.brasil,
        r.iguatemi,
        r.brasilText ?? '',
        r.iguatemiText ?? '',
        r.deltaPct,
      ])
    }
  }

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
