'use client'

import { useCallback, useEffect, useState } from 'react'
import { Download, FileSpreadsheet, Camera } from 'lucide-react'
import { formatCurrency, formatDateTime } from '@/lib/format'

type ReportRunMeta = {
  id: string
  createdAt: string
  trigger: 'on_demand'
  mode: string
  periodLabel: string
  unitCount: number
  todayRevenue: number
  mtdRevenue: number
}

function todayLocalIso(): string {
  // Mesmo fuso do servidor (`todayIsoSaoPaulo` em unit-config).
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function ReportsPanel() {
  const [open, setOpen] = useState(false)
  const [configured, setConfigured] = useState(true)
  const [runs, setRuns] = useState<ReportRunMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [day, setDay] = useState(todayLocalIso)

  const loadRuns = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/reports')
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        data?: { configured: boolean; runs: ReportRunMeta[] }
      }
      if (!res.ok) throw new Error(json.error || `Erro ${res.status}`)
      setConfigured(json.data?.configured ?? false)
      setRuns(json.data?.runs ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void loadRuns()
  }, [open, loadRuns])

  async function captureNow() {
    setCapturing(true)
    setError(null)
    setOkMsg(null)
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        data?: ReportRunMeta
      }
      if (!res.ok) throw new Error(json.error || `Erro ${res.status}`)
      setOkMsg(`Snapshot capturado · ${json.data?.periodLabel ?? day}`)
      await loadRuns()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCapturing(false)
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
          <FileSpreadsheet size={16} className="text-brass" />
          <div>
            <p className="text-sm font-medium text-foreground">Relatórios</p>
            <p className="text-xs text-muted">
              Snapshot por dia · MTD até o dia · CSV / XLSX
            </p>
          </div>
        </div>
        <span className="text-xs text-muted">{open ? 'Fechar' : 'Abrir'}</span>
      </button>

      {open ? (
        <div className="border-t border-border/60 px-4 py-4">
          {!configured ? (
            <p className="text-xs text-warning">
              Neon do Cérebro não configurado (`CEREBRO_DATABASE_URL`).
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[0.65rem] uppercase tracking-wide text-muted">
                    Dia do relatório
                  </span>
                  <input
                    type="date"
                    value={day}
                    max={todayLocalIso()}
                    onChange={(e) => setDay(e.target.value || todayLocalIso())}
                    className="rounded-xl border border-border bg-panel-2 px-3 py-2 text-sm text-foreground outline-none focus:border-brass/50"
                  />
                </label>
                <button
                  type="button"
                  disabled={capturing || !day}
                  onClick={() => void captureNow()}
                  className="inline-flex items-center gap-2 rounded-xl bg-brass/90 px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
                >
                  <Camera size={14} />
                  {capturing ? 'Capturando…' : 'Capturar dia'}
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void loadRuns()}
                  className="rounded-xl border border-border px-3 py-2 text-xs text-muted disabled:opacity-50"
                >
                  Atualizar lista
                </button>
                {error ? <p className="text-xs text-danger">{error}</p> : null}
                {okMsg ? <p className="text-xs text-success">{okMsg}</p> : null}
              </div>

              <p className="mt-3 text-xs text-muted">
                O export é MTD (acumulado do dia 1 até o dia escolhido) em todos os KPIs
                operacionais e financeiros. Estoque/sync = momento da captura. Há uma aba
                extra só com o dia de referência.
              </p>

              <ul className="mt-4 space-y-2">
                {loading && runs.length === 0 ? (
                  <li className="text-xs text-muted">Carregando…</li>
                ) : null}
                {!loading && runs.length === 0 ? (
                  <li className="text-xs text-muted">Nenhuma captura ainda.</li>
                ) : null}
                {runs.map((run) => (
                  <li
                    key={run.id}
                    className="flex flex-col gap-2 rounded-xl border border-border/60 bg-panel-2/60 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm text-foreground">
                        {formatDateTime(run.createdAt)}
                      </p>
                      <p className="text-xs text-muted">
                        {run.periodLabel} · {run.unitCount} un. · dia{' '}
                        {formatCurrency(run.todayRevenue)} · MTD{' '}
                        {formatCurrency(run.mtdRevenue)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={`/api/reports/${run.id}?format=csv`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground hover:border-brass/40"
                      >
                        <Download size={12} />
                        CSV
                      </a>
                      <a
                        href={`/api/reports/${run.id}?format=xlsx`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground hover:border-brass/40"
                      >
                        <Download size={12} />
                        XLSX
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
