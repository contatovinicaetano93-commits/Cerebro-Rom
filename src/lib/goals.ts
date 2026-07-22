import type { Sql } from '@/lib/db'

export interface UnitGoals {
  dailyGoal: number
  capacity: number
  /** true when the unit has saved a positive daily goal in cerebro_goals (or env bootstrap). */
  goalSet: boolean
  /** true when capacity > 0. */
  capacitySet: boolean
  source: 'db' | 'env' | 'unset'
  updatedAt: string | null
}

export const EMPTY_GOALS: UnitGoals = {
  dailyGoal: 0,
  capacity: 0,
  goalSet: false,
  capacitySet: false,
  source: 'unset',
  updatedAt: null,
}

/** Ensures the single-row goals table exists. Cerebro's only intentional write to unit Neons. */
export async function ensureGoalsTable(sql: Sql): Promise<void> {
  await sql`
    create table if not exists cerebro_goals (
      id int primary key default 1 check (id = 1),
      daily_goal numeric not null default 0,
      capacity int not null default 0,
      updated_at timestamptz not null default now()
    )
  `
}

export async function readGoalsFromDb(sql: Sql): Promise<UnitGoals | null> {
  try {
    await ensureGoalsTable(sql)
    const rows = (await sql`
      select
        daily_goal::float as daily_goal,
        capacity::int as capacity,
        updated_at
      from cerebro_goals
      where id = 1
      limit 1
    `) as { daily_goal: number; capacity: number; updated_at: string }[]

    const row = rows[0]
    if (!row) return null

    const dailyGoal = Number(row.daily_goal) || 0
    const capacity = Number(row.capacity) || 0
    return {
      dailyGoal,
      capacity,
      goalSet: dailyGoal > 0,
      capacitySet: capacity > 0,
      source: 'db',
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    }
  } catch {
    return null
  }
}

export async function writeGoalsToDb(
  sql: Sql,
  dailyGoal: number,
  capacity: number,
): Promise<UnitGoals> {
  await ensureGoalsTable(sql)
  const goal = Math.max(0, Math.round(dailyGoal))
  const cap = Math.max(0, Math.round(capacity))

  const rows = (await sql`
    insert into cerebro_goals (id, daily_goal, capacity, updated_at)
    values (1, ${goal}, ${cap}, now())
    on conflict (id) do update set
      daily_goal = excluded.daily_goal,
      capacity = excluded.capacity,
      updated_at = now()
    returning
      daily_goal::float as daily_goal,
      capacity::int as capacity,
      updated_at
  `) as { daily_goal: number; capacity: number; updated_at: string }[]

  const row = rows[0]!
  return {
    dailyGoal: Number(row.daily_goal) || 0,
    capacity: Number(row.capacity) || 0,
    goalSet: (Number(row.daily_goal) || 0) > 0,
    capacitySet: (Number(row.capacity) || 0) > 0,
    source: 'db',
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

export function goalsFromEnv(envGoal: number, envCapacity: number): UnitGoals {
  const dailyGoal = envGoal > 0 ? envGoal : 0
  const capacity = envCapacity > 0 ? envCapacity : 0
  if (dailyGoal <= 0 && capacity <= 0) {
    return { ...EMPTY_GOALS }
  }
  return {
    dailyGoal,
    capacity,
    goalSet: dailyGoal > 0,
    capacitySet: capacity > 0,
    source: 'env',
    updatedAt: null,
  }
}

/** Prefer DB row; else env bootstrap; else unset (no fake R$ 5.000). */
export function resolveGoals(db: UnitGoals | null, env: UnitGoals): UnitGoals {
  if (db && (db.goalSet || db.capacitySet)) return db
  if (env.goalSet || env.capacitySet) return env
  return EMPTY_GOALS
}
