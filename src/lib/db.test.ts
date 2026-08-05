import { describe, expect, it } from 'vitest'
import { resolveDatabaseUrl } from '@/lib/db'

describe('resolveDatabaseUrl', () => {
  it('troca a porta de session (5432) por transaction (6543) no pooler Supabase', () => {
    expect(
      resolveDatabaseUrl(
        'postgresql://postgres.abc:senha@aws-0-sa-east-1.pooler.supabase.com:5432/postgres',
      ),
    ).toBe('postgresql://postgres.abc:senha@aws-0-sa-east-1.pooler.supabase.com:6543/postgres')
  })

  it('preserva query string e senha ao reescrever', () => {
    expect(
      resolveDatabaseUrl(
        'postgresql://u:p%40ss@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require',
      ),
    ).toBe('postgresql://u:p%40ss@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require')
  })

  it('não mexe em quem já está na 6543', () => {
    const url = 'postgresql://u:p@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'
    expect(resolveDatabaseUrl(url)).toBe(url)
  })

  it('não mexe em host direto do Supabase — lá 5432 é a porta certa', () => {
    const url = 'postgresql://postgres:p@db.abcdefgh.supabase.co:5432/postgres'
    expect(resolveDatabaseUrl(url)).toBe(url)
  })

  it('não mexe em Neon nem em localhost', () => {
    const neon = 'postgresql://u:p@ep-cool-sun-123.sa-east-1.aws.neon.tech:5432/db'
    const local = 'postgresql://ci:ci@localhost:5432/ci'
    expect(resolveDatabaseUrl(neon)).toBe(neon)
    expect(resolveDatabaseUrl(local)).toBe(local)
  })

  it('trata vazio sem explodir', () => {
    expect(resolveDatabaseUrl('')).toBe('')
    expect(resolveDatabaseUrl('   ')).toBe('')
  })
})

describe('withDbTimeout', () => {
  it('desiste quando a query nunca responde (pooler sem slot)', async () => {
    const { withDbTimeout } = await import('@/lib/db')
    // Promessa que nunca resolve = pooler que aceita TCP e fica mudo.
    const nunca = new Promise<never>(() => {})
    await expect(withDbTimeout(nunca, 30, 'unidade X')).rejects.toThrow(/Timeout .* unidade X/)
  })

  it('devolve o resultado quando a query responde a tempo', async () => {
    const { withDbTimeout } = await import('@/lib/db')
    await expect(withDbTimeout(Promise.resolve('ok'), 1000, 'unidade X')).resolves.toBe('ok')
  })

  it('propaga o erro original em vez de mascarar como timeout', async () => {
    const { withDbTimeout } = await import('@/lib/db')
    const falha = Promise.reject(new Error('password authentication failed'))
    await expect(withDbTimeout(falha, 1000, 'unidade X')).rejects.toThrow(
      'password authentication failed',
    )
  })
})
