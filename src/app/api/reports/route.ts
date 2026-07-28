import { NextResponse } from 'next/server'
import { buildOverview } from '@/lib/live/overview'
import { getCachedLiveOverview } from '@/lib/overview-cache'
import { captureReportSnapshot, listReportRuns } from '@/lib/reports/store'
import { isCerebroDbConfigured } from '@/lib/db'
import { parseAsOfDay, todayIsoSaoPaulo } from '@/lib/unit-config'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Lista capturas recentes. */
export async function GET() {
  try {
    if (!isCerebroDbConfigured()) {
      return NextResponse.json({
        data: { configured: false, runs: [] as Awaited<ReturnType<typeof listReportRuns>> },
      })
    }
    const runs = await listReportRuns(30)
    return NextResponse.json({ data: { configured: true, runs } })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}

/** Captura sob demanda. Body opcional: `{ "asOf": "YYYY-MM-DD" }` (dia + MTD até a data). */
export async function POST(req: Request) {
  try {
    if (!isCerebroDbConfigured()) {
      return NextResponse.json(
        { error: 'CEREBRO_DATABASE_URL não configurada na Vercel' },
        { status: 503 },
      )
    }

    let asOf: string | undefined
    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const body = (await req.json().catch(() => null)) as { asOf?: unknown } | null
      if (body?.asOf != null && body.asOf !== '') {
        const parsed = parseAsOfDay(body.asOf)
        if (!parsed) {
          return NextResponse.json(
            {
              error:
                'asOf inválido — use YYYY-MM-DD (hoje ou até 120 dias atrás, America/Sao_Paulo)',
            },
            { status: 400 },
          )
        }
        asOf = parsed
      }
    }

    const overview =
      !asOf || asOf === todayIsoSaoPaulo()
        ? await getCachedLiveOverview({ fresh: true })
        : await buildOverview(asOf)
    if (overview.mode === 'mock') {
      return NextResponse.json(
        { error: 'Modo mock — captura de relatório só com dados live' },
        { status: 503 },
      )
    }
    if (overview.mode === 'degraded' && overview.units.length === 0) {
      return NextResponse.json(
        { error: 'Live indisponível — nada para capturar' },
        { status: 503 },
      )
    }
    const run = await captureReportSnapshot(overview)
    return NextResponse.json({ data: run })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
