import { describe, expect, it } from 'vitest'
import { sumKnownTodayRevenue } from './today-revenue'

describe('sumKnownTodayRevenue', () => {
  it('retorna null quando nenhuma unidade tem caixa do dia (não inventa 0)', () => {
    expect(sumKnownTodayRevenue([null, null])).toBeNull()
    expect(sumKnownTodayRevenue([])).toBeNull()
  })

  it('soma só unidades com receita conhecida', () => {
    expect(sumKnownTodayRevenue([null, 1500, null])).toBe(1500)
    expect(sumKnownTodayRevenue([100, 200])).toBe(300)
  })

  it('aceita 0 real (dia fechado sem venda)', () => {
    expect(sumKnownTodayRevenue([0, null])).toBe(0)
  })
})
