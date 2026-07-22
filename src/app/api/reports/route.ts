import { NextResponse } from 'next/server'
import { buildOverview } from '@/lib/live/overview'
import { captureReportSnapshot, listReportRuns } from '@/lib/reports/store'
import { isCerebroDbConfigured } from '@/lib/db'

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

/** Captura sob demanda o overview atual. */
export async function POST() {
  try {
    if (!isCerebroDbConfigured()) {
      return NextResponse.json(
        { error: 'CEREBRO_DATABASE_URL não configurada na Vercel' },
        { status: 503 },
      )
    }
    const overview = await buildOverview()
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
