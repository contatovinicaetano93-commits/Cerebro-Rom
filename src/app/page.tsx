'use client'

import { useEffect, useState } from 'react'
import type { CerebroOverview } from '@/lib/types'
import { Dashboard } from './_components/Dashboard'

export default function HomePage() {
  const [data, setData] = useState<CerebroOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/overview', { cache: 'no-store' })
      .then(async (res) => {
        if (res.status === 401) {
          window.location.href = '/login?next=/'
          return null
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(
            typeof body?.error === 'string' ? body.error : `Erro ao carregar (${res.status})`,
          )
        }
        return res.json() as Promise<{ data?: CerebroOverview; error?: string }>
      })
      .then((json) => {
        if (cancelled || json == null) return
        if (json.error) setError(json.error)
        else if (json.data) setData(json.data)
        else setError('Resposta vazia')
      })
      .catch((e) => {
        if (!cancelled) setError(String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
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

  return <Dashboard data={data} />
}
