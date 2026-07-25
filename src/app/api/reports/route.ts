import { NextRequest, NextResponse } from 'next/server'
import { buildOverview } from '@/lib/live/overview'
import { captureReportSnapshot, listReportRuns } from '@/lib/reports/store'
import { isCerebroDbConfigured } from '@/lib/db'
import { ReportCaptureSchema, validateRequest } from '@/lib/schemas'
import { resolveAsOfDay } from '@/lib/unit-config'

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

/** Captura sob demanda o overview do dia selecionado (default: hoje SP). */
export async function POST(req: NextRequest) {
  try {
    if (!isCerebroDbConfigured()) {
      return NextResponse.json(
        { error: 'CEREBRO_DATABASE_URL não configurada na Vercel' },
        { status: 503 },
      )
    }

    let body: unknown = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }

    const parsed = validateRequest(ReportCaptureSchema, body ?? {})
    if (!parsed.valid) {
      return NextResponse.json({ error: parsed.error }, { status: 422 })
    }

    let asOfDay: string
    try {
      asOfDay = resolveAsOfDay(parsed.data.day)
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : String(e) },
        { status: 422 },
      )
    }

    const overview = await buildOverview({ asOfDay })
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
