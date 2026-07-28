import { NextResponse } from 'next/server'
import { getCachedLiveOverview } from '@/lib/overview-cache'

export const dynamic = 'force-dynamic'
/** Evita função serverless infinita quando um DB de unidade trava. */
export const maxDuration = 30

export async function GET(req: Request) {
  try {
    const fresh = new URL(req.url).searchParams.get('fresh') === '1'
    const data = await getCachedLiveOverview({ fresh })
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
