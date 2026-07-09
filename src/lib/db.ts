import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

export type Sql = NeonQueryFunction<false, false>

export function getSql(databaseUrl: string): Sql {
  if (!databaseUrl?.trim()) {
    throw new Error('DATABASE_URL vazia')
  }
  return neon(databaseUrl)
}
