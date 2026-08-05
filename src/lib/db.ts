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
 * O pooler do Supabase atende em duas portas: 5432 (session) e 6543 (transaction).
 * Em session mode a conexão fica presa ao client até ele encerrar; em serverless,
 * onde cada invocação abre a sua, isso estoura o limite (EMAXCONNSESSION) e o
 * painel passa a alternar entre lento e fora do ar. Transaction mode devolve a
 * conexão a cada query.
 *
 * Reescreve SÓ host de pooler Supabase na 5432 — host direto, Neon, localhost e
 * qualquer outra porta passam intactos. Seguro porque o client já usa
 * `prepare: false`, que é o requisito do transaction mode.
 */
export function resolveDatabaseUrl(raw: string): string {
  const url = raw.trim()
  if (!url) return url
  return url.replace(/(@[^/@\s]*\.pooler\.supabase\.com):5432(?=[/?]|$)/, '$1:6543')
}

function getClient(databaseUrl: string): PostgresSql {
  const resolved = resolveDatabaseUrl(databaseUrl)
  let client = clients.get(resolved)
  if (!client) {
    client = postgres(resolved, {
      ssl: 'require',
      // 1 conexão por URL: Promise.all>max enfileirava sem bound e travava o overview.
      max: 1,
      prepare: false,
      idle_timeout: 20,
      max_lifetime: 60 * 5,
      // Pooler morto/quota pode aceitar TCP e não responder — não ficar preso.
      connect_timeout: 10,
      // Mata query lenta antes do race 18s do overview — evita statement_timeout
      // órfão derrubar o isolate (Unhandled Rejection / exit 128).
      connection: {
        statement_timeout: 12_000,
      },
    })
    // Mesma chave do get acima: usar a URL crua aqui faria o cache nunca acertar
    // e abrir um client novo por chamada.
    clients.set(resolved, client)
  }
  return client
}

/** Descarta client preso (timeout/quota) para a próxima tentativa não herdar hang. */
export function evictSql(databaseUrl: string): void {
  // Precisa resolver igual ao getClient, senão não acha o client para descartar.
  const url = resolveDatabaseUrl(databaseUrl)
  if (!url) return
  const client = clients.get(url)
  if (!client) return
  clients.delete(url)
  void client.end({ timeout: 1 }).catch(() => {})
}

/**
 * Teto de tempo para qualquer ida ao banco de uma UNIDADE.
 *
 * O pooler saturado aceita a conexão e não responde — postgres.js não tem
 * timeout de query, então a espera é infinita e a função morre no limite da
 * plataforma (visto em produção: `/api/health` pendurado por 300s). Com teto,
 * saturação vira erro em segundos e o painel consegue reportar em vez de travar
 * junto com o problema.
 *
 * Quem chama deve `evictSql(url)` no catch: o client que ficou preso não pode
 * ser reaproveitado pela próxima invocação.
 */
export async function withDbTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timeout ${Math.round(timeoutMs / 1000)}s — ${label}`))
    }, timeoutMs)
  })
  try {
    return await Promise.race([work, timeout])
  } catch (err) {
    // Timeout (ou outro erro) venceu: a query Postgres ainda pode rejeitar
    // depois com statement_timeout — sem engolir, vira Unhandled Rejection
    // e mata o isolate (exit 128 no /api/overview).
    void work.catch(() => {})
    throw err
  } finally {
    if (timer) clearTimeout(timer)
  }
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
