import { NextResponse } from 'next/server'
import { buildOverview } from '@/lib/live/overview'
import { cachedFetch } from '@/lib/cache'

export const dynamic = 'force-dynamic'
/** Evita função serverless infinita quando um DB de unidade trava. */
export const maxDuration = 30

/** TTL curto — painel pode pollar; não martelar Supabase a cada request. */
const OVERVIEW_CACHE_TTL_S = 45

export async function GET() {
  try {
    const data = await cachedFetch('overview:live', () => buildOverview(), OVERVIEW_CACHE_TTL_S)
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
