import { NextResponse } from 'next/server'
import { getHealthStatus } from '@/lib/health'

export const dynamic = 'force-dynamic'

/** Health completo — só autenticado (middleware + sem bypass público). */
export async function GET() {
  return NextResponse.json({ data: await getHealthStatus() })
}
