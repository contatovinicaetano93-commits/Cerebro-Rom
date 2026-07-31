import type { UnitSnapshot } from '../types'

export type UnitSyncRunRow = {
  status: string
  created_at: string
  error: string | null
  kind: string
}

const RUNNING_SYNC_TTL_MS = 12 * 60_000

function syncRunTime(row: Pick<UnitSyncRunRow, 'created_at'>): number {
  return new Date(row.created_at).getTime()
}

function newestSyncRun(rows: UnitSyncRunRow[]): UnitSyncRunRow | null {
  if (rows.length === 0) return null
  return rows.reduce((latest, row) =>
    syncRunTime(row) >= syncRunTime(latest) ? row : latest,
  )
}

function syncAgeLabel(createdAt: string, nowMs: number): string {
  const ageMs = nowMs - new Date(createdAt).getTime()
  const ageH = ageMs / 3_600_000
  return ageH < 1 ? `${Math.max(1, Math.round(ageH * 60))} min` : `${ageH.toFixed(1)}h`
}

export function resolveUnitSyncStatus({
  full,
  fast,
  runningAt,
  nowMs = Date.now(),
}: {
  full: UnitSyncRunRow | null
  fast: UnitSyncRunRow | null
  runningAt: string | null
  nowMs?: number
}): UnitSnapshot['sync'] {
  const empty: UnitSnapshot['sync'] = {
    status: 'stale',
    lastSyncAt: new Date(0).toISOString(),
    label: 'Sem registro de sync Avec',
  }
  const runningMs = runningAt != null ? new Date(runningAt).getTime() : NaN
  const running =
    runningAt != null &&
    Number.isFinite(runningMs) &&
    nowMs - runningMs <= RUNNING_SYNC_TTL_MS
  const finished = [full, fast].filter((row): row is UnitSyncRunRow => row != null)

  if (finished.length === 0) {
    if (running && runningAt != null) {
      return {
        status: 'ok',
        lastSyncAt: new Date(runningAt).toISOString(),
        label: 'Sync Avec em andamento…',
        running: true,
      }
    }
    return empty
  }

  const fullAgeHours =
    full != null ? (nowMs - new Date(full.created_at).getTime()) / 3_600_000 : null
  const fastAgeHours =
    fast != null ? (nowMs - new Date(fast.created_at).getTime()) / 3_600_000 : null
  const fullStale = fullAgeHours != null && fullAgeHours > 24
  // Paridade sync-meta: missing fast ≠ stale por si só (never_synced só se ambos null).
  const fastStale = fastAgeHours != null && fastAgeHours > 1
  const ageStale = fullStale || fastStale
  const latest = newestSyncRun(finished)!

  // Status do run mais recente — full antigo error/partial não mascara fast ok (Hoje/caixa).
  if (latest.status === 'error') {
    const lastSyncAt = new Date(latest.created_at).toISOString()
    const ageLabel = syncAgeLabel(latest.created_at, nowMs)
    return {
      status: 'error',
      lastSyncAt,
      label: latest.error
        ? `Sync erro (~${ageLabel}): ${latest.error.slice(0, 80)}`
        : `Último sync com erro (~${ageLabel})`,
      running,
    }
  }

  // partial antes de running/age-stale — partial útil não vira "desatualizado".
  if (latest.status === 'partial') {
    const lastSyncAt = new Date(latest.created_at).toISOString()
    const ageLabel = syncAgeLabel(latest.created_at, nowMs)
    const abandoned =
      latest.error?.includes('abandoned_partial_timeout') ||
      latest.error?.includes('Sync interrompido')
    return {
      status: 'partial',
      lastSyncAt,
      label: abandoned
        ? `Sync incompleto (timeout, ${latest.kind}, ~${ageLabel}) · dados usáveis`
        : latest.error
          ? `Sync parcial (${latest.kind}, ~${ageLabel}): ${latest.error.slice(0, 80)}`
          : `Sync parcial (${latest.kind}, ~${ageLabel}) · dados usáveis`,
      running,
    }
  }

  const lastSyncAt = new Date(latest.created_at).toISOString()
  const ageMs = nowMs - new Date(latest.created_at).getTime()
  const ageLabel = syncAgeLabel(latest.created_at, nowMs)

  if (running) {
    return {
      status: 'ok',
      lastSyncAt,
      label: `Sync Avec em andamento… (último ok ~${ageLabel})`,
      running: true,
    }
  }

  if (ageStale) {
    if (fastStale && fastAgeHours != null) {
      return {
        status: 'stale',
        lastSyncAt,
        label: `Sync fast atrasado (~${Math.max(1, Math.round(fastAgeHours * 60))} min) — caixa/Hoje pode estar velho`,
      }
    }
    if (fullStale && fullAgeHours != null) {
      return {
        status: 'stale',
        lastSyncAt,
        label: `Sync full atrasado (~${fullAgeHours.toFixed(1)}h) — analytics desatualizados`,
      }
    }
    return {
      status: 'stale',
      lastSyncAt,
      label: `Sync atrasado (~${ageLabel})`,
    }
  }

  const mins = Math.max(1, Math.round(ageMs / 60_000))
  return {
    status: 'ok',
    lastSyncAt,
    label:
      mins < 60
        ? `Avec sync há ${mins} min`
        : `Avec sync há ${(mins / 60).toFixed(1)}h`,
  }
}
