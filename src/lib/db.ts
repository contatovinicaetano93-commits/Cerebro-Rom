import postgres, { type Sql as PostgresSql } from 'postgres'

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dns').setDefaultResultOrder('ipv4first')
} catch {
  // older Node / non-Node
}

/** Tagged-template client (compatível com o uso anterior do neon). */
export type Sql = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (strings: TemplateStringsArray, ...values: any[]): Promise<any[]>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: (query: string, params?: any[]) => Promise<any[]>
}

const clients = new Map<string, PostgresSql>()

/**
 * Session pooler (:5432) on Supabase has few slots (EMAXCONNSESSION).
 * In serverless (Vercel), transaction mode (:6543) releases the connection after each query.
 *
 * Only rewrites Supabase pooler hosts — Neon (CEREBRO_DATABASE_URL) is never touched.
 */
export function resolveDatabaseUrl(raw: string): string {
  const trimmed = raw.trim()
  try {
    const u = new URL(trimmed)
    const isSupabasePooler =
      u.hostname.includes('pooler.supabase.com') || u.hostname.includes('.pooler.supabase.')
    const port = u.port || '5432'
    if (isSupabasePooler && port === '5432') {
      u.port = '6543'
      return u.toString()
    }
  } catch {
    // invalid URL — let postgres.js fail with the original string
  }
  return trimmed
}

function getClient(resolvedUrl: string): PostgresSql {
  let client = clients.get(resolvedUrl)
  if (!client) {
    client = postgres(resolvedUrl, {
      ssl: 'require',
      max: 1,
      prepare: false,
      idle_timeout: 20,
      max_lifetime: 60 * 5,
      // Neon morto/quota pode aceitar TCP e não responder — não ficar preso.
      connect_timeout: 8,
    })
    clients.set(resolvedUrl, client)
  }
  return client
}

/**
 * Descarta client preso (timeout/quota) para a próxima tentativa não herdar hang.
 * Resolves the URL (port rewrite) before lookup so it matches what getSql stored.
 */
export function evictSql(databaseUrl: string): void {
  const url = resolveDatabaseUrl(databaseUrl)
  if (!url) return
  const client = clients.get(url)
  if (!client) return
  clients.delete(url)
  void client.end({ timeout: 1 }).catch(() => {})
}

function wrap(sql: PostgresSql): Sql {
  const tagged = ((strings: TemplateStringsArray, ...values: unknown[]) =>
    sql(strings, ...(values as never[]))) as unknown as Sql

  tagged.query = async (query: string, params: unknown[] = []) => {
    return sql.unsafe(query, params as never[]) as unknown as unknown[]
  }

  return tagged
}

/**
 * Client Postgres para uma URL explícita (unidade Supabase) ou, sem argumento,
 * apenas CEREBRO_DATABASE_URL (Neon) — nunca cai no DB de uma unidade.
 *
 * Unit URLs (databaseUrl provided): :5432 → :6543 rewrite for Supabase transaction pooler.
 * CEREBRO_DATABASE_URL (Neon): no rewrite — Neon speaks native Postgres, not Supabase pooler.
 *
 * Do NOT switch back to neon() from @neondatabase/serverless for Brasil:
 * neon() is HTTP-only and fails against *.supabase.com / pooler hosts.
 */
export function getSql(databaseUrl?: string): Sql {
  if (databaseUrl !== undefined) {
    // Unit Supabase URL — rewrite :5432 → :6543 for transaction mode pooler.
    const raw = databaseUrl.trim()
    if (!raw) throw new Error('DATABASE_URL vazia')
    return wrap(getClient(resolveDatabaseUrl(raw)))
  }
  // Cérebro's own Neon DB — no port rewrite.
  const url = process.env.CEREBRO_DATABASE_URL?.trim() || ''
  if (!url) {
    throw new Error('CEREBRO_DATABASE_URL vazia — helpers do Cérebro não usam DB das unidades')
  }
  return wrap(getClient(url))
}

/** Postgres exclusivo do Cérebro — snapshots/relatórios (Neon). */
export function getCerebroSql(): Sql {
  const url = process.env.CEREBRO_DATABASE_URL?.trim()
  if (!url) {
    throw new Error('CEREBRO_DATABASE_URL não configurada')
  }
  return wrap(getClient(url))
}

export function isCerebroDbConfigured(): boolean {
  return Boolean(process.env.CEREBRO_DATABASE_URL?.trim())
}
