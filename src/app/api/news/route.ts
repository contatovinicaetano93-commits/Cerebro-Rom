import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { fetchCerebroNews } from '@/lib/live/fetch-news'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const denied = await requireSession(req)
  if (denied) return denied

  try {
    const data = await fetchCerebroNews()
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha ao ler ROM News' },
      { status: 500 },
    )
  }
}
