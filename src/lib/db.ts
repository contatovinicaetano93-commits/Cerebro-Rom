import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

export type Sql = NeonQueryFunction<false, false>

/**
 * Neon client. Live paths always pass an explicit unit URL.
 * Platform helpers (audit/migrations) may omit it and fall back to env.
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
  return neon(url)
}

/** Neon exclusivo do Cérebro — snapshots/relatórios. */
export function getCerebroSql(): Sql {
  const url = process.env.CEREBRO_DATABASE_URL?.trim()
  if (!url) {
    throw new Error('CEREBRO_DATABASE_URL não configurada')
  }
  return neon(url)
}

export function isCerebroDbConfigured(): boolean {
  return Boolean(process.env.CEREBRO_DATABASE_URL?.trim())
}
