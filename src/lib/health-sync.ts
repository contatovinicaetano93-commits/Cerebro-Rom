export type UnitSyncMeta = {
  fast_status: string | null
  fast_age_min: number | null
  full_status: string | null
  full_age_min: number | null
  running: boolean
}

export type UnitHealthProbe = {
  slug: string
  name: string
  configured: boolean
  connected: boolean
  error: string | null
  sync: UnitSyncMeta | null
}

/** Paridade live: fast >1h ou full >24h = stale. */
const FAST_SYNC_STALE_MIN = 60
const FULL_SYNC_STALE_MIN = 24 * 60

/**
 * Sync operacional saudável por unidade conectada.
 * Desconectadas não entram (liveness fica em `ok` do health).
 */
export function computeSyncOk(probes: Pick<UnitHealthProbe, 'connected' | 'sync'>[]): boolean {
  return probes.every((probe) => {
    if (!probe.connected) {
      return true
    }

    const sync = probe.sync
    if (sync == null) {
      return false
    }

    if (
      sync.fast_status === 'error' ||
      sync.full_status === 'error' ||
      sync.fast_status === 'partial' ||
      sync.full_status === 'partial'
    ) {
      return false
    }

    if (sync.running) {
      return true
    }

    if (sync.fast_status == null && sync.full_status == null) {
      return false
    }

    return !(
      (sync.fast_age_min != null && sync.fast_age_min > FAST_SYNC_STALE_MIN) ||
      (sync.full_age_min != null && sync.full_age_min > FULL_SYNC_STALE_MIN)
    )
  })
}
