import { clamp01 } from './format'
import type { CerebroOverview, UnitSlug, UnitSnapshot } from './types'

/** Compartilhado entre live (overview.ts) e mock (mock-overview.ts) — nunca duplicar isso de novo. */
export function rate(num: number, den: number): number {
  if (den <= 0) return 0
  return clamp01(num / den)
}

/**
 * Retorna a unidade líder pela métrica dada. Em empate exato, `Array.sort` é
 * estável e mantém a ordem de entrada do array `units` — hoje sempre
 * `['rom-brasil', 'rom-iguatemi']` (ordem alfabética, ver overview.ts), ou
 * seja, empates favorecem Brasil de forma determinística, não aleatória.
 * Documentado aqui de propósito (achado de revisão de código) — se isso
 * precisar virar uma regra de negócio diferente, é só aqui que muda.
 */
export function leaderBy(units: UnitSnapshot[], score: (u: UnitSnapshot) => number): UnitSlug {
  const sorted = [...units].sort((a, b) => score(b) - score(a))
  return sorted[0]?.unit.slug ?? 'rom-brasil'
}

/** Comparativo entre unidades — só existe com as duas presentes. */
export function buildComparison(units: UnitSnapshot[]): CerebroOverview['comparison'] {
  const brasil = units.find((u) => u.unit.slug === 'rom-brasil')
  const iguatemi = units.find((u) => u.unit.slug === 'rom-iguatemi')
  if (!brasil || !iguatemi) return undefined

  const deltaRevenuePct =
    iguatemi.mtd.revenue > 0
      ? (brasil.mtd.revenue - iguatemi.mtd.revenue) / iguatemi.mtd.revenue
      : brasil.mtd.revenue > 0
        ? null
        : 0

  return {
    revenueLeader: leaderBy(units, (u) => u.mtd.revenue),
    occupancyLeader: leaderBy(units, (u) => rate(u.today.appointments, u.today.capacity)),
    attendanceLeader: leaderBy(units, (u) => rate(u.today.attended, u.today.appointments)),
    ticketLeader: leaderBy(units, (u) => u.today.ticketAvg),
    deltaRevenuePct,
  }
}
