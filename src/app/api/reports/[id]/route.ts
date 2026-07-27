import { NextResponse } from 'next/server'
import { getReportRun } from '@/lib/reports/store'
import {
  buildComparativoCsv,
  buildComparativoXlsx,
  buildReportCsv,
  buildReportXlsx,
} from '@/lib/reports/export'
import { isCerebroDbConfigured } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

/** Exporta captura: ?format=csv|xlsx&scope=full|comparativo */
export async function GET(req: Request, { params }: Params) {
  try {
    if (!isCerebroDbConfigured()) {
      return NextResponse.json({ error: 'CEREBRO_DATABASE_URL não configurada' }, { status: 503 })
    }
    const { id } = await params
    const url = new URL(req.url)
    const format = url.searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv'
    const scope =
      url.searchParams.get('scope') === 'comparativo' ? 'comparativo' : 'full'
    const run = await getReportRun(id)
    if (!run) {
      return NextResponse.json({ error: 'Relatório não encontrado' }, { status: 404 })
    }

    const stamp = run.createdAt.slice(0, 19).replace(/[:T]/g, '-')
    const base =
      scope === 'comparativo'
        ? `cerebro-comparativo-${stamp}`
        : `cerebro-relatorio-${stamp}`

    if (format === 'xlsx') {
      const buf =
        scope === 'comparativo'
          ? await buildComparativoXlsx(run)
          : await buildReportXlsx(run)
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${base}.xlsx"`,
        },
      })
    }

    const csv =
      scope === 'comparativo' ? buildComparativoCsv(run) : buildReportCsv(run)
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${base}.csv"`,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
