import { NextResponse } from 'next/server'
import { getPublicHealthStatus } from '@/lib/health'

export const dynamic = 'force-dynamic'

/** Probe público para uptime — sem auth, sem DB, sem segredos. */
export async function GET() {
  return NextResponse.json(await getPublicHealthStatus())
}
