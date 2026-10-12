/** Soma receita do dia só de unidades com valor conhecido — null se nenhuma (não inventar R$ 0). */
export function sumKnownTodayRevenue(revenues: Array<number | null | undefined>): number | null {
  const known = revenues.filter((r): r is number => r != null && Number.isFinite(r))
  return known.length > 0 ? known.reduce((a, r) => a + r, 0) : null
}
