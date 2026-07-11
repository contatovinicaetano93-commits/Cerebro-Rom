import { NextRequest, NextResponse } from 'next/server'
import { getHealthStatus, getPublicHealthStatus } from '@/lib/health'
import { isAuthorized } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (await isAuthorized(req)) {
    return NextResponse.json({ data: await getHealthStatus() })
  }
  return NextResponse.json({ data: await getPublicHealthStatus() })
}
