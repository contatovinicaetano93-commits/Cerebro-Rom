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

function getClient(databaseUrl: string): PostgresSql {
  let client = clients.get(databaseUrl)
  if (!client) {
    client = postgres(databaseUrl, {
      ssl: 'require',
      max: 1,
      prepare: false,
      idle_timeout: 60,
      max_lifetime: 60 * 30,
      connect_timeout: 30,
      connection: {
        statement_timeout: 600000,
      },
    })
    clients.set(databaseUrl, client)
  }
  return client
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
 * Postgres client. Live paths always pass an explicit unit URL.
 * Platform helpers (audit/migrations) may omit it and fall back to env.
 * Aceita Neon TCP ou Supabase pooler (IPv4).
 */
export function getSql(databaseUrl?: string): Sql {
  const url =
    databaseUrl?.trim() ||
    process.env.NEON_BRASIL_DATABASE_URL?.trim() ||
    process.env.NEON_IGUATEMI_DATABASE_URL?.trim() ||
    process.env.CEREBRO_DATABASE_URL?.trim() ||
    ''
  if (!url) {
    throw new Error('DATABASE_URL vazia')
  }
  return wrap(getClient(url))
}

/** Postgres exclusivo do Cérebro — snapshots/relatórios. */
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
