import { NextResponse } from 'next/server'
import { getReportRun } from '@/lib/reports/store'
import { buildReportCsv, buildReportXlsx } from '@/lib/reports/export'
import { isCerebroDbConfigured } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

/** Exporta captura: ?format=csv|xlsx */
export async function GET(req: Request, { params }: Params) {
  try {
    if (!isCerebroDbConfigured()) {
      return NextResponse.json({ error: 'CEREBRO_DATABASE_URL não configurada' }, { status: 503 })
    }
    const { id } = await params
    const format = new URL(req.url).searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv'
    const run = await getReportRun(id)
    if (!run) {
      return NextResponse.json({ error: 'Relatório não encontrado' }, { status: 404 })
    }

    const stamp = run.createdAt.slice(0, 19).replace(/[:T]/g, '-')
    if (format === 'xlsx') {
      const buf = await buildReportXlsx(run)
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="cerebro-relatorio-${stamp}.xlsx"`,
        },
      })
    }

    const csv = buildReportCsv(run)
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="cerebro-relatorio-${stamp}.csv"`,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
