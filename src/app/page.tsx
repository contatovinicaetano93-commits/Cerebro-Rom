'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CerebroOverview } from '@/lib/types'
import { Dashboard } from './_components/Dashboard'

export default function HomePage() {
  const [data, setData] = useState<CerebroOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/overview', { cache: 'no-store' })
      if (res.status === 401) {
        window.location.href = '/login?next=/'
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(
          typeof body?.error === 'string' ? body.error : `Erro ao carregar (${res.status})`,
        )
      }
      const json = (await res.json()) as { data?: CerebroOverview; error?: string }
      if (json.error) setError(json.error)
      else if (json.data) setData(json.data)
      else setError('Resposta vazia')
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="font-display text-3xl tracking-tight text-brass">Cérebro</p>
          <p className="mt-2 animate-pulse-soft text-sm text-muted">Carregando painel Waltter…</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-md rounded-2xl border border-border bg-panel p-6 text-center">
          <p className="font-display text-2xl">Não foi possível carregar</p>
          <p className="mt-2 text-sm text-muted">{error ?? 'Resposta vazia'}</p>
        </div>
      </div>
    )
  }

  return (
    <Dashboard
      data={data}
      onRefresh={() => {
        setLoading(true)
        void load()
      }}
    />
  )
}
