import { NextResponse } from 'next/server'
import { getCachedLiveOverview } from '@/lib/overview-cache'

export const dynamic = 'force-dynamic'
/** Evita função serverless infinita quando um DB de unidade trava. */
export const maxDuration = 30

export async function GET() {
  try {
    const data = await getCachedLiveOverview()
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
