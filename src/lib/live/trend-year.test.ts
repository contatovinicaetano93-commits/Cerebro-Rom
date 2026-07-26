import { describe, expect, it } from 'vitest'

const MONTH_LABEL_PT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

/** Espelha buildTrendYear (overview) para teste unitário sem DB. */
function buildTrendYear(
  br: { month: string; revenue: number }[],
  ig: { month: string; revenue: number }[],
  today: string,
) {
  const brMap = new Map(br.map((m) => [m.month, m.revenue]))
  const igMap = new Map(ig.map((m) => [m.month, m.revenue]))
  const year = today.slice(0, 4)
  const lastMonth = Number(today.slice(5, 7)) || 1
  const out: {
    month: string
    label: string
    brasil: number
    iguatemi: number
    delta: number
  }[] = []
  for (let m = 1; m <= lastMonth; m++) {
    const month = `${year}-${String(m).padStart(2, '0')}`
    const b = brMap.get(month) ?? 0
    const i = igMap.get(month) ?? 0
    out.push({
      month,
      label: MONTH_LABEL_PT[m - 1]!,
      brasil: Math.round(b),
      iguatemi: Math.round(i),
      delta: Math.round(b - i),
    })
  }
  return out
}

describe('trendYear month comparison', () => {
  it('preenche Jan→mês atual e calcula Δ Brasil−IG', () => {
    const rows = buildTrendYear(
      [{ month: '2026-07', revenue: 2_873_783 }],
      [
        { month: '2026-06', revenue: 989_093 },
        { month: '2026-07', revenue: 2_665_302 },
      ],
      '2026-07-26',
    )
    expect(rows).toHaveLength(7)
    expect(rows[0]).toMatchObject({ label: 'Jan', brasil: 0, iguatemi: 0, delta: 0 })
    expect(rows[5]).toMatchObject({
      label: 'Jun',
      brasil: 0,
      iguatemi: 989_093,
      delta: -989_093,
    })
    expect(rows[6]).toMatchObject({
      label: 'Jul',
      brasil: 2_873_783,
      iguatemi: 2_665_302,
      delta: 2_873_783 - 2_665_302,
    })
  })
})
