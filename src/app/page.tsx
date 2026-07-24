'use client'

import { useEffect, useState } from 'react'
import type { CerebroOverview } from '@/lib/types'
import { Dashboard } from './_components/Dashboard'

const OVERVIEW_POLL_MS = 60_000

async function fetchOverview(): Promise<CerebroOverview> {
  const res = await fetch('/api/overview', { cache: 'no-store' })
  if (res.status === 401) {
    window.location.href = '/login?next=/'
    throw new Error('Não autorizado')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      typeof body?.error === 'string' ? body.error : `Erro ao carregar (${res.status})`,
    )
  }
  const json = (await res.json()) as { data?: CerebroOverview; error?: string }
  if (json.error) throw new Error(json.error)
  if (!json.data) throw new Error('Resposta vazia')
  return json.data
}

export default function HomePage() {
  const [data, setData] = useState<CerebroOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const load = async (opts?: { silent?: boolean }) => {
      try {
        const next = await fetchOverview()
        if (cancelled) return
        setData(next)
        setError(null)
      } catch (e) {
        if (cancelled) return
        // Na atualização em background, mantém o último painel se a rede falhar.
        if (!opts?.silent) setError(String(e))
      } finally {
        if (!cancelled && !opts?.silent) setLoading(false)
      }
    }

    void load()

    const id = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return
      void load({ silent: true })
    }, OVERVIEW_POLL_MS)

    const onVisible = () => {
      if (document.visibilityState === 'visible') void load({ silent: true })
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
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
