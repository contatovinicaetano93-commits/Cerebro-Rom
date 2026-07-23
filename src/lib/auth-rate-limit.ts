import { getCerebroSql, isCerebroDbConfigured, type Sql } from '@/lib/db'
import { RateLimiter } from '@/lib/rate-limiter'

const DEFAULT_MAX = 20
const DEFAULT_WINDOW_SEC = 15 * 60

async function ensureTable(sql: Sql): Promise<void> {
  await sql`
    create table if not exists auth_rate_limits (
      key text primary key,
      hits int not null default 0,
      window_starts_at timestamptz not null,
      updated_at timestamptz not null default now()
    )
  `
}

/** Só consulta — não incrementa (sucesso de login não consome cota). */
export async function isLoginBlocked(
  key: string,
  maxRequests = DEFAULT_MAX,
  windowSeconds = DEFAULT_WINDOW_SEC,
): Promise<boolean> {
  if (!isCerebroDbConfigured()) {
    return RateLimiter.isBlocked(key, maxRequests, windowSeconds)
  }

  const sql = getCerebroSql()
  await ensureTable(sql)
  const rows = (await sql`
    select hits, window_starts_at
    from auth_rate_limits
    where key = ${key}
    limit 1
  `) as { hits: number; window_starts_at: string | Date }[]

  const row = rows[0]
  if (!row) return false
  const age = Date.now() - new Date(row.window_starts_at).getTime()
  if (age >= windowSeconds * 1000) return false
  return (Number(row.hits) || 0) >= maxRequests
}

/** Registra falha de senha/usuário. */
export async function recordLoginFailure(
  key: string,
  maxRequests = DEFAULT_MAX,
  windowSeconds = DEFAULT_WINDOW_SEC,
): Promise<{ blocked: boolean; remaining: number }> {
  if (!isCerebroDbConfigured()) {
    const ok = RateLimiter.checkLimit(key, maxRequests, windowSeconds)
    return {
      blocked: !ok,
      remaining: RateLimiter.getRemaining(key, maxRequests),
    }
  }

  const sql = getCerebroSql()
  await ensureTable(sql)
  const now = new Date()
  const windowMs = windowSeconds * 1000

  const rows = (await sql`
    select hits, window_starts_at
    from auth_rate_limits
    where key = ${key}
    limit 1
  `) as { hits: number; window_starts_at: string | Date }[]

  const row = rows[0]
  const windowStart = row ? new Date(row.window_starts_at).getTime() : 0
  const expired = !row || now.getTime() - windowStart >= windowMs

  if (expired) {
    await sql`
      insert into auth_rate_limits (key, hits, window_starts_at, updated_at)
      values (${key}, 1, ${now.toISOString()}, ${now.toISOString()})
      on conflict (key) do update set
        hits = 1,
        window_starts_at = excluded.window_starts_at,
        updated_at = excluded.updated_at
    `
    return { blocked: false, remaining: maxRequests - 1 }
  }

  const hits = Number(row.hits) || 0
  if (hits >= maxRequests) {
    return { blocked: true, remaining: 0 }
  }

  const next = hits + 1
  await sql`
    update auth_rate_limits
    set hits = ${next}, updated_at = ${now.toISOString()}
    where key = ${key}
  `
  return {
    blocked: next >= maxRequests,
    remaining: Math.max(0, maxRequests - next),
  }
}
