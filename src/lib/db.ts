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
      // fetchLiveUnit faz Promise.all de 4 leituras — max:1 serializa/trava sob
      // pooler Supabase. 3 cobre o fan-out sem estourar session/tx limits.
      max: 3,
      prepare: false,
      idle_timeout: 20,
      max_lifetime: 60 * 5,
      // Neon morto/quota pode aceitar TCP e não responder — não ficar preso.
      connect_timeout: 8,
    })
    clients.set(databaseUrl, client)
  }
  return client
}

/** Descarta client preso (timeout/quota) para a próxima tentativa não herdar hang. */
export function evictSql(databaseUrl: string): void {
  const url = databaseUrl.trim()
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
 * Client Postgres para uma URL explícita (unidade) ou, sem argumento,
 * apenas CEREBRO_DATABASE_URL — nunca cai no DB de uma unidade.
 *
 * Do NOT switch back to neon() from @neondatabase/serverless for Brasil:
 * neon() is HTTP-only and fails against *.supabase.com / pooler hosts.
 */
export function getSql(databaseUrl?: string): Sql {
  const url = databaseUrl?.trim() || process.env.CEREBRO_DATABASE_URL?.trim() || ''
  if (!url) {
    throw new Error(
      databaseUrl === undefined
        ? 'CEREBRO_DATABASE_URL vazia — helpers do Cérebro não usam DB das unidades'
        : 'DATABASE_URL vazia',
    )
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
