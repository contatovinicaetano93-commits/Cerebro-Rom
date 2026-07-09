import { NextResponse } from 'next/server'
import { buildOverview } from '@/lib/live/overview'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await buildOverview()
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
