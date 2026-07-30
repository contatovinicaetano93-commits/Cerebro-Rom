import type { DayMetrics } from '@/lib/types'

/**
 * Mix novos/recorrentes do Avec às vezes conta dump/backfill como “novo”.
 * Zera o que for impossível/absurdo — sem apagar retornos Avec (0002) válidos
 * só porque `new_clients` veio inflado.
 */
export function sanitizeDayMix(day: DayMetrics, capacity: number, capacitySet: boolean): void {
  if (day.attended <= 0 && day.revenue <= 0) {
    day.newClients = 0
    day.returningClients = 0
    return
  }
  // Ex.: 838 “novos” com capacidade 110 — lixo de sync, não KPI.
  if (capacitySet && capacity > 0 && day.newClients > capacity * 1.5) {
    day.newClients = 0
  }
  const apptCap = Math.max(day.appointments, day.attended)
  if (apptCap > 0 && day.newClients > apptCap) {
    day.newClients = 0
  }
  if (apptCap > 0 && day.returningClients > apptCap) {
    day.returningClients = 0
  }
  const mix = day.newClients + day.returningClients
  if (apptCap > 0 && mix > apptCap) {
    // Dump de “novos” costuma ser o vilão; preserva retornos se couberem sozinhos.
    if (day.returningClients > 0 && day.returningClients <= apptCap) {
      day.newClients = 0
    } else {
      day.newClients = 0
      day.returningClients = 0
    }
  }
}
