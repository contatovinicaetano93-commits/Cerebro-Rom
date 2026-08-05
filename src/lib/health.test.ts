import { describe, expect, it } from 'vitest'
import { getPublicHealthStatus } from '@/lib/health'
import {
  computeSyncOk,
  pickHealthFinishedRun,
  type UnitHealthProbe,
  type UnitSyncMeta,
} from './health-sync'
import { isEmptyKillError } from './live/sync-status'

function sync(overrides: Partial<UnitSyncMeta> = {}): UnitSyncMeta {
  return {
    fast_status: 'ok',
    fast_age_min: 10,
    full_status: 'ok',
    full_age_min: 120,
    running: false,
    ...overrides,
  }
}

function probe(overrides: Partial<UnitHealthProbe> = {}): UnitHealthProbe {
  return {
    slug: 'rom-brasil',
    name: 'ROM Brasil',
    configured: true,
    connected: true,
    error: null,
    sync: sync(),
    ...overrides,
  }
}

describe('getPublicHealthStatus', () => {
  it('returns minimal public payload without secrets', async () => {
    const status = await getPublicHealthStatus()
    expect(status.ok).toBe(true)
    expect(status.service).toBe('cerebro')
    expect(typeof status.units_configured).toBe('number')
    expect(status).not.toHaveProperty('units')
    expect(status).not.toHaveProperty('readiness')
    expect(JSON.stringify(status)).not.toMatch(/pooler\.supabase\.com|neon\.tech|postgres:\/\//i)
  })
})

describe('computeSyncOk', () => {
  it('ignores disconnected units', () => {
    expect(computeSyncOk([probe({ connected: false, sync: null })])).toBe(true)
  })

  it('fails when a connected unit has no sync metadata', () => {
    expect(computeSyncOk([probe({ sync: null })])).toBe(false)
  })

  it('fails for error or partial statuses', () => {
    expect(computeSyncOk([probe({ sync: sync({ fast_status: 'error' }) })])).toBe(false)
    expect(computeSyncOk([probe({ sync: sync({ full_status: 'partial' }) })])).toBe(false)
  })

  it('fails stale ages unless sync is running', () => {
    expect(computeSyncOk([probe({ sync: sync({ fast_age_min: 61 }) })])).toBe(false)
    expect(computeSyncOk([probe({ sync: sync({ full_age_min: 24 * 60 + 1 }) })])).toBe(false)
    expect(
      computeSyncOk([
        probe({ sync: sync({ fast_age_min: 61, full_age_min: 24 * 60 + 1, running: true }) }),
      ]),
    ).toBe(true)
  })
})

describe('pickHealthFinishedRun', () => {
  it('skips empty-kill when a healthier finished run exists', () => {
    const picked = pickHealthFinishedRun(
      [
        {
          status: 'error',
          created_at: '2026-07-31T12:00:00.000Z',
          error: 'Sync interrompido (timeout/kill)',
        },
        {
          status: 'ok',
          created_at: '2026-07-31T11:40:00.000Z',
          error: null,
        },
      ],
      isEmptyKillError,
    )
    expect(picked?.status).toBe('ok')
  })

  it('keeps real errors', () => {
    const picked = pickHealthFinishedRun(
      [
        {
          status: 'error',
          created_at: '2026-07-31T12:00:00.000Z',
          error: 'P3 falhou',
        },
        {
          status: 'ok',
          created_at: '2026-07-31T11:40:00.000Z',
          error: null,
        },
      ],
      isEmptyKillError,
    )
    expect(picked?.status).toBe('error')
    expect(picked?.error).toBe('P3 falhou')
  })
})
