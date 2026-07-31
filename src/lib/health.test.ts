import { describe, expect, it } from 'vitest'
import {
  computeSyncOk,
  type UnitHealthProbe,
  type UnitSyncMeta,
} from './health-sync'

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
