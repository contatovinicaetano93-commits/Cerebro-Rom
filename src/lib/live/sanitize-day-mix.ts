import type { DayMetrics } from '@/lib/types'

/**
 * Mix novos/recorrentes do Avec às vezes conta dump/backfill como "novo".
 * Clampeia o que for impossível/absurdo — sem apagar retornos Avec (0002) válidos
 * só porque `new_clients` veio inflado.
 */
export function sanitizeDayMix(day: DayMetrics, capacity: number, capacitySet: boolean): void {
  // attended or revenue unknown → don't zero mix (state unknown, not zero-money).
  if (day.attended === null || day.revenue === null) return

  // Known zeros: no movement → zero mix.
  if (day.attended <= 0 && day.revenue <= 0) {
    day.newClients = 0
    day.returningClients = 0
    return
  }

  // Ex.: 838 "novos" com capacidade 110 — lixo de sync, não KPI.
  if (capacitySet && capacity > 0 && (day.newClients ?? 0) > capacity * 1.5) {
    day.newClients = 0
  }

  const apptCap = Math.max(day.appointments ?? 0, day.attended)
  if (apptCap <= 0) return

  const newC = day.newClients ?? 0
  const retC = day.returningClients ?? 0
  const mix = newC + retC

  if (mix > apptCap) {
    // Soft-clamp: preserve returningClients first, then clamp newClients to fit.
    if (retC <= apptCap) {
      day.newClients = Math.max(0, apptCap - retC)
    } else {
      // returningClients alone exceeds cap — clamp both.
      day.returningClients = apptCap
      day.newClients = 0
    }
  }
}
