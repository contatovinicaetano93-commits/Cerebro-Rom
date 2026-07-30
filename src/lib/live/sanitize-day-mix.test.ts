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
  it('preserva retornos quando novos inflados estouram a agenda', () => {
    const d = day({
      revenue: 158175,
      attended: 134,
      appointments: 97,
      newClients: 317,
      returningClients: 10,
    })
    sanitizeDayMix(d, 227, true)
    expect(d.newClients).toBe(0)
    expect(d.returningClients).toBe(10)
  })

  it('zera mix quando o dia ainda não tem dinheiro', () => {
    const d = day({ newClients: 5, returningClients: 2 })
    sanitizeDayMix(d, 227, true)
    expect(d.newClients).toBe(0)
    expect(d.returningClients).toBe(0)
  })

  it('zera novos absurdos vs capacidade', () => {
    const d = day({
      revenue: 1000,
      attended: 10,
      appointments: 80,
      newClients: 400,
      returningClients: 3,
    })
    sanitizeDayMix(d, 110, true)
    expect(d.newClients).toBe(0)
    expect(d.returningClients).toBe(3)
  })
})
