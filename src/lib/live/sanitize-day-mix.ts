import type { DayMetrics } from '@/lib/types'

/**
 * Mix novos/recorrentes do Avec às vezes conta dump/backfill como "novo"
 * (ex.: 141 novos + 1 retorno com 176 atendidos). Clampeia o impossível e
 * anula o mix quando a proporção é absurda — sem inventar 1ª visita.
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

  const newC = day.newClients ?? 0
  const retC = day.returningClients ?? 0
  const mix = newC + retC
  const attended = day.attended

  // Dia cheio com quase zero "já vinha" e a maior parte marcada como 1ª visita:
  // total_visitas do 0002 veio quebrado — não mostrar como KPI.
  if (
    attended >= 25 &&
    mix >= 20 &&
    retC <= Math.max(2, Math.floor(attended * 0.05)) &&
    newC >= attended * 0.4
  ) {
    day.newClients = null
    day.returningClients = null
    return
  }

  if (mix >= 30 && retC / mix < 0.1 && newC >= 20) {
    day.newClients = null
    day.returningClients = null
    return
  }

  const apptCap = Math.max(day.appointments ?? 0, attended)
  if (apptCap <= 0) return

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
