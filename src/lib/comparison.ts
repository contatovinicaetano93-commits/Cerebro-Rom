import { clamp01 } from './format'
import type { UnitSlug, UnitSnapshot } from './types'

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
