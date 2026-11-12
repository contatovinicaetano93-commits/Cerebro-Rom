'use client'

import { useEffect, useState } from 'react'
import { Newspaper } from 'lucide-react'
import type { CerebroNewsItem } from '@/lib/live/fetch-news'
import { Panel } from './ui'

function formatWhen(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    timeZone: 'America/Sao_Paulo',
  })
    .format(date)
    .replace('.', '')
}

function kindLabel(kind: CerebroNewsItem['kind']): string {
  switch (kind) {
    case 'news':
      return 'Notícia'
    case 'event':
      return 'Evento'
    case 'banner':
      return 'Banner'
    case 'policy':
      return 'Política'
    default: {
      const _never: never = kind
      return _never
    }
  }
}

export function NewsPanel() {
  const [items, setItems] = useState<CerebroNewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/news', { cache: 'no-store' })
      .then(async (res) => {
        if (res.status === 401) {
          window.location.href = '/login?next=/'
          throw new Error('Não autorizado')
        }
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? `Erro ${res.status}`)
        return json.data?.items ?? []
      })
      .then((next: CerebroNewsItem[]) => {
        if (!cancelled) {
          setItems(next)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setItems([])
          setError(err instanceof Error ? err.message : 'Falha ao carregar')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Newspaper className="size-4 text-brass" />
          <p className="text-[0.65rem] uppercase tracking-[0.22em] text-brass">ROM News</p>
        </div>
        <p className="text-xs text-muted">Brasil · Iguatemi</p>
      </div>
      <p className="mt-2 text-sm text-muted">
        Feed consolidado do jornal digital das unidades (intranet).
      </p>

      {loading ? <p className="mt-4 text-sm text-muted">Carregando notícias…</p> : null}
      {error ? <p className="mt-4 text-sm text-warning">{error}</p> : null}

      {!loading && !error && items.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          Nenhuma notícia publicada ainda nas unidades — o marketing publica em /empresa.
        </p>
      ) : null}

      {items.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li key={`${item.unit}-${item.id}`}>
              <a
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="block rounded-xl border border-border/70 bg-background/40 px-3 py-2 transition hover:border-brass/40"
              >
                <p className="text-[0.65rem] uppercase tracking-[0.18em] text-muted">
                  {item.unitLabel} · {kindLabel(item.kind)}
                  {item.published_at ? ` · ${formatWhen(item.published_at)}` : ''}
                </p>
                <p className="mt-1 text-sm font-medium">{item.title}</p>
                {item.excerpt ? <p className="mt-0.5 text-xs text-muted line-clamp-2">{item.excerpt}</p> : null}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  )
}
