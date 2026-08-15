import { describe, it, expect } from 'vitest'
import type { DayMetrics } from '../types'
import { sanitizeDayMix } from './sanitize-day-mix'

function day(partial: Partial<DayMetrics>): DayMetrics {
  return {
    day: '2026-07-29',
    revenue: 0,
    appointments: 0,
    attended: 0,
    noShows: 0,
    cancelled: 0,
    newClients: 0,
    returningClients: 0,
    ticketAvg: 0,
    capacity: 227,
    dailyGoal: 161000,
    goalSet: true,
    capacitySet: true,
    leads: 0,
    converted: 0,
    ...partial,
  }
}

describe('sanitizeDayMix', () => {
  it('soft-clamps newClients when novos inflados estouram a agenda (preserva retornos)', () => {
    const d = day({
      revenue: 158175,
      attended: 134,
      appointments: 97,
      newClients: 317,
      returningClients: 40,
    })
    sanitizeDayMix(d, 227, true)
    // apptCap = max(97, 134) = 134; mix = 317+40 > 134; ret=40 <= 134
    // ret/mix ~11% → ainda confiável o bastante para soft-clamp
    expect(d.returningClients).toBe(40)
    expect(d.newClients).toBe(94)
  })

  it('zera mix quando o dia ainda não tem dinheiro (known zeros)', () => {
    const d = day({ attended: 0, revenue: 0, newClients: 5, returningClients: 2 })
    sanitizeDayMix(d, 227, true)
    expect(d.newClients).toBe(0)
    expect(d.returningClients).toBe(0)
  })

  it('zera novos absurdos vs capacidade (extreme dump > capacity*1.5)', () => {
    const d = day({
      revenue: 1000,
      attended: 10,
      appointments: 80,
      newClients: 400,
      returningClients: 3,
    })
    sanitizeDayMix(d, 110, true)
    // 400 > 110*1.5=165 → extreme dump → newClients=0; mix=3 <= apptCap=80 → no further clamp
    expect(d.newClients).toBe(0)
    expect(d.returningClients).toBe(3)
  })

  it('anula mix quando dia cheio vem quase só como 1ª visita (lixo 0002)', () => {
    const d = day({
      revenue: 176090,
      attended: 176,
      appointments: 245,
      newClients: 141,
      returningClients: 1,
    })
    sanitizeDayMix(d, 200, true)
    expect(d.newClients).toBeNull()
    expect(d.returningClients).toBeNull()
  })

  it('anula mix BR com returning=0 e novos inflados', () => {
    const d = day({
      revenue: 159100,
      attended: 166,
      appointments: 226,
      newClients: 68,
      returningClients: 0,
    })
    sanitizeDayMix(d, 200, true)
    expect(d.newClients).toBeNull()
    expect(d.returningClients).toBeNull()
  })

  it('preserva mix saudável (maioria já vinha)', () => {
    const d = day({
      revenue: 87510,
      attended: 109,
      appointments: 122,
      newClients: 32,
      returningClients: 55,
    })
    sanitizeDayMix(d, 200, true)
    expect(d.newClients).toBe(32)
    expect(d.returningClients).toBe(55)
  })

  it('returns early without zeroing mix when attended is null (unknown state)', () => {
    const d = day({ attended: null, revenue: 0, newClients: 5, returningClients: 3 })
    sanitizeDayMix(d, 227, true)
    expect(d.newClients).toBe(5)
    expect(d.returningClients).toBe(3)
  })

  it('returns early without zeroing mix when revenue is null (unknown money)', () => {
    const d = day({ attended: 10, revenue: null, newClients: 5, returningClients: 3 })
    sanitizeDayMix(d, 227, true)
    expect(d.newClients).toBe(5)
    expect(d.returningClients).toBe(3)
  })

  it('clamps returningClients and zeros newClients when returning alone exceeds apptCap', () => {
    const d = day({
      revenue: 5000,
      attended: 50,
      appointments: 60,
      newClients: 5,
      returningClients: 80,
    })
    sanitizeDayMix(d, 100, true)
    // apptCap = max(60, 50) = 60; mix = 85 > 60; ret=80 > 60 → clamp ret to 60, zero new
    expect(d.returningClients).toBe(60)
    expect(d.newClients).toBe(0)
  })

  it('does not change mix when it fits within apptCap', () => {
    const d = day({
      revenue: 5000,
      attended: 50,
      appointments: 60,
      newClients: 10,
      returningClients: 40,
    })
    sanitizeDayMix(d, 100, true)
    // mix = 50 <= apptCap = 60 → no change
    expect(d.newClients).toBe(10)
    expect(d.returningClients).toBe(40)
  })
})
