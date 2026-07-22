'use client'

import { useState } from 'react'
import { Target } from 'lucide-react'
import type { CerebroOverview, UnitSlug } from '@/lib/types'
import { formatCurrency } from '@/lib/format'

type Draft = { dailyGoal: string; capacity: string }

function unitDraft(data: CerebroOverview, slug: UnitSlug): Draft {
  const u = data.units.find((x) => x.unit.slug === slug)
  return {
    dailyGoal: u?.today.goalSet ? String(u.today.dailyGoal) : '',
    capacity: u?.today.capacitySet ? String(u.today.capacity) : '',
  }
}

export function GoalsEditor({
  data,
  onSaved,
}: {
  data: CerebroOverview
  onSaved: () => void
}) {
  const [open, setOpen] = useState(!data.consolidated.goalsConfigured)
  const [brasil, setBrasil] = useState<Draft>(() => unitDraft(data, 'rom-brasil'))
  const [iguatemi, setIguatemi] = useState<Draft>(() => unitDraft(data, 'rom-iguatemi'))
  const [saving, setSaving] = useState<UnitSlug | 'both' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  async function saveUnit(slug: UnitSlug, draft: Draft) {
    const dailyGoal = Number(String(draft.dailyGoal).replace(/\./g, '').replace(',', '.')) || 0
    const capacity = Number(String(draft.capacity).replace(/\./g, '').replace(',', '.')) || 0
    const res = await fetch('/api/goals', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unit: slug, dailyGoal, capacity }),
    })
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) throw new Error(json.error || `Erro ${res.status}`)
  }

  async function saveAll() {
    setError(null)
    setOkMsg(null)
    setSaving('both')
    try {
      const jobs: Promise<void>[] = []
      if (data.units.some((u) => u.unit.slug === 'rom-brasil')) {
        jobs.push(saveUnit('rom-brasil', brasil))
      }
      if (data.units.some((u) => u.unit.slug === 'rom-iguatemi')) {
        jobs.push(saveUnit('rom-iguatemi', iguatemi))
      }
      await Promise.all(jobs)
      setOkMsg('Metas salvas')
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-panel/80">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2.5">
          <Target size={16} className="text-brass" />
          <div>
            <p className="text-sm font-medium text-foreground">Metas das unidades</p>
            <p className="text-xs text-muted">
              {data.consolidated.goalsConfigured
                ? `Brasil ${formatCurrency(
                    data.units.find((u) => u.unit.slug === 'rom-brasil')?.today.dailyGoal ?? 0,
                  )} · Iguatemi ${formatCurrency(
                    data.units.find((u) => u.unit.slug === 'rom-iguatemi')?.today.dailyGoal ?? 0,
                  )}`
                : 'Defina meta diária e capacidade — sem placeholder'}
            </p>
          </div>
        </div>
        <span className="text-xs text-muted">{open ? 'Fechar' : 'Editar'}</span>
      </button>

      {open ? (
        <div className="border-t border-border/60 px-4 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                { slug: 'rom-brasil' as const, label: 'ROM Brasil', draft: brasil, set: setBrasil },
                {
                  slug: 'rom-iguatemi' as const,
                  label: 'ROM Iguatemi',
                  draft: iguatemi,
                  set: setIguatemi,
                },
              ] as const
            ).map((block) => {
              const present = data.units.some((u) => u.unit.slug === block.slug)
              return (
                <div key={block.slug} className="space-y-3">
                  <p className="text-[0.65rem] uppercase tracking-[0.18em] text-muted">
                    {block.label}
                    {!present ? ' · offline' : ''}
                  </p>
                  <label className="block text-xs text-muted">
                    Meta diária (R$)
                    <input
                      type="number"
                      min={0}
                      step={100}
                      disabled={!present || saving != null}
                      value={block.draft.dailyGoal}
                      onChange={(e) => block.set({ ...block.draft, dailyGoal: e.target.value })}
                      placeholder="Ex.: 5000"
                      className="mt-1 w-full rounded-xl border border-border bg-panel-2 px-3 py-2 text-sm text-foreground outline-none focus:border-brass/50"
                    />
                  </label>
                  <label className="block text-xs text-muted">
                    Capacidade (atend./dia)
                    <input
                      type="number"
                      min={0}
                      step={1}
                      disabled={!present || saving != null}
                      value={block.draft.capacity}
                      onChange={(e) => block.set({ ...block.draft, capacity: e.target.value })}
                      placeholder="Ex.: 15"
                      className="mt-1 w-full rounded-xl border border-border bg-panel-2 px-3 py-2 text-sm text-foreground outline-none focus:border-brass/50"
                    />
                  </label>
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={saving != null || data.mode === 'degraded'}
              onClick={() => void saveAll()}
              className="rounded-xl bg-brass/90 px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {saving ? 'Salvando…' : 'Salvar metas'}
            </button>
            {error ? <p className="text-xs text-danger">{error}</p> : null}
            {okMsg ? <p className="text-xs text-success">{okMsg}</p> : null}
            {data.mode === 'mock' ? (
              <p className="text-xs text-muted">Mock: salvar exige Neon live.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
