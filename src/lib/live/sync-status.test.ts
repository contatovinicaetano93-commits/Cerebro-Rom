import { describe, expect, it } from 'vitest'
import { resolveUnitSyncStatus, type UnitSyncRunRow } from './sync-status'

const NOW = Date.parse('2026-07-31T12:00:00.000Z')

function iso(minutesAgo: number): string {
  return new Date(NOW - minutesAgo * 60_000).toISOString()
}

function run(
  kind: 'fast' | 'full',
  status: UnitSyncRunRow['status'],
  minutesAgo: number,
  error: string | null = null,
): UnitSyncRunRow {
  return {
    kind,
    status,
    created_at: iso(minutesAgo),
    error,
  }
}

describe('resolveUnitSyncStatus', () => {
  it('prefers a newer fast ok over an older full error', () => {
    const sync = resolveUnitSyncStatus({
      full: run('full', 'error', 50, 'P3 falhou'),
      fast: run('fast', 'ok', 5),
      runningAt: null,
      nowMs: NOW,
    })

    expect(sync.status).toBe('ok')
    expect(sync.lastSyncAt).toBe(iso(5))
    expect(sync.label).toContain('Avec sync há 5 min')
  })

  it('prefers the most recent errored kind when both finished rows errored', () => {
    const sync = resolveUnitSyncStatus({
      full: run('full', 'error', 90, 'full falhou'),
      fast: run('fast', 'error', 10, 'fast falhou'),
      runningAt: null,
      nowMs: NOW,
    })

    expect(sync.status).toBe('error')
    expect(sync.lastSyncAt).toBe(iso(10))
    expect(sync.label).toContain('fast falhou')
  })

  it('prefers a newer fast ok over an older full partial timeout', () => {
    const sync = resolveUnitSyncStatus({
      full: run('full', 'partial', 60 * 5, 'abandoned_partial_timeout'),
      fast: run('fast', 'ok', 10),
      runningAt: null,
      nowMs: NOW,
    })

    expect(sync.status).toBe('ok')
    expect(sync.lastSyncAt).toBe(iso(10))
    expect(sync.label).toContain('Avec sync há 10 min')
  })

  it('still marks analytics stale when full is older than 24h even if fast ok', () => {
    const sync = resolveUnitSyncStatus({
      full: run('full', 'ok', 60 * 26),
      fast: run('fast', 'ok', 10),
      runningAt: null,
      nowMs: NOW,
    })

    expect(sync.status).toBe('stale')
    expect(sync.label).toContain('Snapshot Avec full atrasado')
  })

  it('surfaces the newest hard partial when it is more recent than ok', () => {
    const sync = resolveUnitSyncStatus({
      full: run('full', 'ok', 60 * 2),
      fast: run('fast', 'partial', 8, 'abandoned_partial_timeout'),
      runningAt: null,
      nowMs: NOW,
    })

    expect(sync.status).toBe('partial')
    expect(sync.lastSyncAt).toBe(iso(8))
    expect(sync.label).toContain('timeout, fast')
  })

  it('treats soft fast partial (error null / budget abort) as ok when fresh', () => {
    const sync = resolveUnitSyncStatus({
      full: run('full', 'ok', 60 * 2),
      fast: run('fast', 'partial', 8, null),
      runningAt: null,
      nowMs: NOW,
    })

    expect(sync.status).toBe('ok')
    expect(sync.lastSyncAt).toBe(iso(8))
    expect(sync.label).toContain('Avec sync há 8 min')
  })

  it('still marks full stale when soft fast partial is fresh but full >24h', () => {
    const sync = resolveUnitSyncStatus({
      full: run('full', 'ok', 60 * 26),
      fast: run('fast', 'partial', 10, null),
      runningAt: null,
      nowMs: NOW,
    })

    expect(sync.status).toBe('stale')
    expect(sync.label).toContain('Snapshot Avec full atrasado')
    expect(sync.label).toContain('receita do dia ok via fast')
  })

  it('ignores an abandoned running row so stale age can surface', () => {
    const sync = resolveUnitSyncStatus({
      full: run('full', 'ok', 60 * 2),
      fast: run('fast', 'ok', 70),
      runningAt: iso(17),
      nowMs: NOW,
    })

    expect(sync.status).toBe('stale')
    expect(sync.running).toBeUndefined()
    expect(sync.label).toContain('Sync fast atrasado')
  })

  it('keeps a fresh running row as in-progress before stale', () => {
    const sync = resolveUnitSyncStatus({
      full: run('full', 'ok', 60 * 2),
      fast: run('fast', 'ok', 70),
      runningAt: iso(5),
      nowMs: NOW,
    })

    expect(sync.status).toBe('ok')
    expect(sync.running).toBe(true)
    expect(sync.label).toContain('em andamento')
  })

  it('prefers older full ok over a newer empty kill error on fast', () => {
    const sync = resolveUnitSyncStatus({
      full: run('full', 'ok', 30),
      fast: run('fast', 'error', 2, 'Sync interrompido (abandoned_partial_timeout)'),
      runningAt: null,
      nowMs: NOW,
    })

    expect(sync.status).toBe('ok')
    expect(sync.lastSyncAt).toBe(iso(30))
    expect(sync.label).toContain('Avec sync há 30 min')
  })

  it('still surfaces a real newer error such as P3 falhou', () => {
    const sync = resolveUnitSyncStatus({
      full: run('full', 'ok', 40),
      fast: run('fast', 'error', 3, 'P3 falhou'),
      runningAt: null,
      nowMs: NOW,
    })

    expect(sync.status).toBe('error')
    expect(sync.lastSyncAt).toBe(iso(3))
    expect(sync.label).toContain('P3 falhou')
  })

  it('does not mark fast stale based on an old empty-kill error row', () => {
    // Old empty-kill fast (90 min) should NOT trigger fastStale; only full age matters.
    const sync = resolveUnitSyncStatus({
      full: run('full', 'ok', 30),
      fast: run('fast', 'error', 90, 'Sync interrompido (abandoned_partial_timeout)'),
      runningAt: null,
      nowMs: NOW,
    })

    // Without fix: fastAgeHours=1.5h → fastStale=true → stale label "fast atrasado".
    // With fix: empty-kill fast not counted for age → fastStale=false → full fresh → ok.
    expect(sync.status).toBe('ok')
    expect(sync.label).toContain('30 min')
    expect(sync.label).not.toContain('fast atrasado')
  })
})
