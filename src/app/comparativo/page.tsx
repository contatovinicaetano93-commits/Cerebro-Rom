'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CerebroOverview } from '@/lib/types'
import { ComparativoCharts } from '../_components/ComparativoCharts'

/** Ritmo leve: alinhado ao home (cache API ~45s). */
const OVERVIEW_POLL_MS = 180_000
const OVERVIEW_FETCH_TIMEOUT_MS = 25_000

async function fetchOverview(opts?: { fresh?: boolean }): Promise<CerebroOverview> {
  let res: Response
  const qs = opts?.fresh ? '?fresh=1' : ''
  try {
    res = await fetch(`/api/overview${qs}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(OVERVIEW_FETCH_TIMEOUT_MS),
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'TimeoutError') {
      throw new Error('Comparativo demorou demais — DB de unidade pode estar offline/quota')
    }
    throw e
  }
  if (res.status === 401) {
    window.location.href = '/login?next=/comparativo'
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

export default function ComparativoPage() {
  const [data, setData] = useState<CerebroOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (opts?: { silent?: boolean; fresh?: boolean }) => {
    try {
      const next = await fetchOverview({ fresh: opts?.fresh })
      setData(next)
      setError(null)
    } catch (e) {
      if (!opts?.silent) setError(String(e))
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const run = async (opts?: { silent?: boolean }) => {
      if (cancelled) return
      await load(opts)
    }

    void run()

    const id = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return
      void run({ silent: true })
    }, OVERVIEW_POLL_MS)

    const onVisible = () => {
      if (document.visibilityState === 'visible') void run({ silent: true })
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="font-display text-3xl tracking-tight text-brass">Cérebro</p>
          <p className="mt-2 animate-pulse-soft text-sm text-muted">
            Carregando comparativo…
          </p>
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

  return <ComparativoCharts data={data} />
}
