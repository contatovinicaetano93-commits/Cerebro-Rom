'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { BarChart3, Camera, Download, FileSpreadsheet } from 'lucide-react'
import { formatCurrency, formatDateTime } from '@/lib/format'
import { REPORT_AS_OF_EARLIEST } from '@/lib/unit-config'

type ReportRunMeta = {
  id: string
  createdAt: string
  trigger: 'on_demand'
  mode: string
  periodLabel: string
  unitCount: number
  todayRevenue: number
  mtdRevenue: number
  networkReadable?: boolean
}

function todayLocalIso(): string {
  const d = new Date()
  // Prefer America/Sao_Paulo for the picker default (same as live).
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

function minAsOfIso(): string {
  return REPORT_AS_OF_EARLIEST
}

export function ReportsPanel() {
  const [open, setOpen] = useState(false)
  const [configured, setConfigured] = useState(true)
  const [runs, setRuns] = useState<ReportRunMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [asOf, setAsOf] = useState(todayLocalIso)

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
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ asOf }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        data?: ReportRunMeta
      }
      if (!res.ok) throw new Error(json.error || `Erro ${res.status}`)
      const dayNote =
        asOf === todayLocalIso() ? 'hoje' : `dia ${asOf} (MTD até a data)`
      setOkMsg(`Snapshot capturado · ${dayNote}`)
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
              Data escolhida · completo · comparativo · CSV / XLSX
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
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Data do relatório
                  <input
                    type="date"
                    value={asOf}
                    min={minAsOfIso()}
                    max={todayLocalIso()}
                    onChange={(e) => setAsOf(e.target.value)}
                    className="rounded-xl border border-border bg-panel-2 px-3 py-2 text-sm text-foreground"
                  />
                </label>
                <button
                  type="button"
                  disabled={capturing || !asOf}
                  onClick={() => void captureNow()}
                  className="inline-flex items-center gap-2 rounded-xl bg-brass/90 px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
                >
                  <Camera size={14} />
                  {capturing ? 'Capturando…' : 'Capturar na data'}
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void loadRuns()}
                  className="rounded-xl border border-border px-3 py-2 text-xs text-muted disabled:opacity-50"
                >
                  Atualizar lista
                </button>
                <Link
                  href="/comparativo"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-teal/35 bg-teal/10 px-3 py-2 text-xs text-teal hover:border-teal/55"
                >
                  <BarChart3 size={12} />
                  Ver gráficos
                </Link>
                {error ? <p className="text-xs text-danger">{error}</p> : null}
                {okMsg ? <p className="text-xs text-success">{okMsg}</p> : null}
              </div>

              <p className="mt-3 text-xs text-muted">
                Escolha o dia (KPIs do dia + MTD até essa data). Export completo inclui Rede,
                Unidades, Comparativo, Alertas, Tendência 30d, Semana e Comercial. Em datas
                passadas, estoque/sync refletem o momento da captura (não rewind).
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
                        {run.periodLabel} · {run.unitCount} un. · hoje{' '}
                        {run.networkReadable === false
                          ? '—'
                          : formatCurrency(run.todayRevenue)}{' '}
                        · MTD{' '}
                        {run.networkReadable === false
                          ? '—'
                          : formatCurrency(run.mtdRevenue)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={`/api/reports/${run.id}?format=csv&scope=comparativo`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-teal/35 px-2.5 py-1.5 text-xs text-teal hover:border-teal/55"
                        title="Só Brasil × Iguatemi (MTD + dia)"
                      >
                        <Download size={12} />
                        Comparativo CSV
                      </a>
                      <a
                        href={`/api/reports/${run.id}?format=xlsx&scope=comparativo`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-teal/35 px-2.5 py-1.5 text-xs text-teal hover:border-teal/55"
                        title="Só Brasil × Iguatemi (MTD + dia)"
                      >
                        <Download size={12} />
                        Comparativo XLSX
                      </a>
                      <a
                        href={`/api/reports/${run.id}?format=csv`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground hover:border-brass/40"
                      >
                        <Download size={12} />
                        Completo CSV
                      </a>
                      <a
                        href={`/api/reports/${run.id}?format=xlsx`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground hover:border-brass/40"
                      >
                        <Download size={12} />
                        Completo XLSX
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
