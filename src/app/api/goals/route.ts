import { NextResponse } from 'next/server'
import { getSql } from '@/lib/db'
import { getUnitConfig } from '@/lib/unit-config'
import { writeGoalsToDb } from '@/lib/goals'
import { GoalsUpdateSchema, validateRequest } from '@/lib/schemas'

export const dynamic = 'force-dynamic'

/**
 * Persiste meta diária + capacidade na Neon da unidade (tabela cerebro_goals).
 * Única escrita intencional do Cérebro nos Neons operacionais.
 */
export async function PUT(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = validateRequest(GoalsUpdateSchema, body)
  if (!parsed.valid) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const { unit, dailyGoal, capacity } = parsed.data
  const config = getUnitConfig(unit)
  if (!config?.databaseUrl) {
    return NextResponse.json(
      { error: `Neon não configurada para ${unit}` },
      { status: 503 },
    )
  }

  try {
    const sql = getSql(config.databaseUrl)
    const goals = await writeGoalsToDb(sql, dailyGoal, capacity)
    return NextResponse.json({
      data: {
        unit,
        dailyGoal: goals.dailyGoal,
        capacity: goals.capacity,
        goalSet: goals.goalSet,
        capacitySet: goals.capacitySet,
        updatedAt: goals.updatedAt,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
