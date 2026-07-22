import type { getSql } from '@/lib/db'
import type { OpsFinance, OpsStock, PaymentReconcileStatus } from '@/lib/types'

type Sql = ReturnType<typeof getSql>

function n(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const x = Number(v)
    return Number.isFinite(x) ? x : 0
  }
  return 0
}

async function tableExists(sql: Sql, name: string): Promise<boolean> {
  try {
    const rows = (await sql`
      select to_regclass(${`public.${name}`}) is not null as ok
    `) as { ok: boolean }[]
    return Boolean(rows[0]?.ok)
  } catch {
    return false
  }
}

function reconcile(revenue: number, paymentsTotal: number): PaymentReconcileStatus {
  if (paymentsTotal <= 0 && revenue > 0) return 'missing_payments'
  if (revenue <= 0 && paymentsTotal > 0) return 'missing_revenue'
  if (paymentsTotal <= 0 && revenue <= 0) return 'unknown'
  const delta = Math.abs(paymentsTotal - revenue)
  const tolerance = Math.max(1, Math.round(revenue * 0.01 * 100) / 100)
  return delta > tolerance ? 'divergent' : 'aligned'
}

function parseMoneyField(row: Record<string, unknown>): number {
  const keys = ['custo_total', 'valor_total', 'custo', 'valor', 'total', 'totalCost']
  for (const k of keys) {
    if (row[k] != null) {
      const raw = row[k]
      if (typeof raw === 'number' && Number.isFinite(raw)) return raw
      if (typeof raw === 'string') {
        const cleaned = raw.replace(/[R$\s.]/g, '').replace(',', '.')
        const x = Number(cleaned)
        if (Number.isFinite(x)) return x
      }
    }
  }
  return 0
}

/** Soma valorização oficial Avec 0045 a partir do snapshot bruto (quando existir). */
async function fetchOfficialStockTotal(sql: Sql): Promise<number | null> {
  if (!(await tableExists(sql, 'avec_report_snapshots'))) return null
  try {
    const rows = (await sql`
      select payload
      from avec_report_snapshots
      where report_id = '0045'
      order by created_at desc
      limit 1
    `) as { payload: unknown }[]
    const payload = rows[0]?.payload
    if (!Array.isArray(payload) || payload.length === 0) return null
    let sum = 0
    let hit = 0
    for (const item of payload) {
      if (item == null || typeof item !== 'object') continue
      const money = parseMoneyField(item as Record<string, unknown>)
      if (money > 0) {
        sum += money
        hit += 1
      }
    }
    return hit > 0 ? Math.round(sum * 100) / 100 : null
  } catch {
    return null
  }
}

export const EMPTY_OPS_FINANCE: OpsFinance = {
  mtdRevenue: 0,
  mtdAttended: 0,
  mtdTicketAvg: 0,
  cmv: 0,
  cmvShare: null,
  paymentsTotal: 0,
  paymentReconcile: 'unknown',
  topPaymentMethod: null,
  available: false,
}

export const EMPTY_OPS_STOCK: OpsStock = {
  available: false,
  totalValue: 0,
  productCount: 0,
  activeAlerts: 0,
  zeroProducts: 0,
  drift: null,
}

/**
 * Camada financeira Avec-only: CMV (0044) + mix 0081 (P2).
 * Despesas manuais ficam fora de propósito.
 */
export async function fetchOpsFinance(
  sql: Sql,
  monthStart: string,
  today: string,
  mtdRevenue: number,
  mtdAttended: number,
): Promise<OpsFinance> {
  const mtdTicketAvg = mtdAttended > 0 ? Math.round(mtdRevenue / mtdAttended) : 0

  let cmv = 0
  let cmvOk = false
  if (await tableExists(sql, 'stock_movements')) {
    try {
      const rows = (await sql`
        select coalesce(sum(coalesce(cost, 0)), 0)::float as cmv
        from stock_movements
        where type = 'saida'
          and (occurred_at at time zone 'America/Sao_Paulo')::date >= ${monthStart}::date
          and (occurred_at at time zone 'America/Sao_Paulo')::date <= ${today}::date
      `) as { cmv: number }[]
      cmv = Math.round(n(rows[0]?.cmv) * 100) / 100
      cmvOk = true
    } catch {
      cmv = 0
    }
  }

  let paymentsTotal = 0
  let topPaymentMethod: string | null = null
  let mixOk = false
  if (await tableExists(sql, 'salon_p2_daily')) {
    try {
      const rows = (await sql`
        select payment_mix
        from salon_p2_daily
        where day >= ${monthStart}::date and day <= ${today}::date
        order by day desc
      `) as { payment_mix: unknown }[]

      const byMethod = new Map<string, number>()
      for (const row of rows) {
        const mix = Array.isArray(row.payment_mix) ? row.payment_mix : []
        for (const item of mix) {
          if (item == null || typeof item !== 'object') continue
          const rec = item as Record<string, unknown>
          const method = typeof rec.method === 'string' ? rec.method.trim() : ''
          if (!method) continue
          byMethod.set(method, (byMethod.get(method) ?? 0) + n(rec.amount))
        }
      }
      mixOk = rows.length > 0
      for (const [method, amount] of byMethod) {
        paymentsTotal += amount
        if (topPaymentMethod == null || amount > (byMethod.get(topPaymentMethod) ?? 0)) {
          topPaymentMethod = method
        }
      }
      paymentsTotal = Math.round(paymentsTotal * 100) / 100
    } catch {
      // ok
    }
  }

  const cmvShare = mtdRevenue > 0 ? cmv / mtdRevenue : null

  return {
    mtdRevenue,
    mtdAttended,
    mtdTicketAvg,
    cmv,
    cmvShare,
    paymentsTotal,
    paymentReconcile: reconcile(mtdRevenue, paymentsTotal),
    topPaymentMethod,
    available: cmvOk || mixOk || mtdRevenue > 0,
  }
}

/** Estoque Avec — tabelas sync; ausência → available:false sem quebrar overview. */
export async function fetchOpsStock(sql: Sql): Promise<OpsStock> {
  if (!(await tableExists(sql, 'stock_products'))) {
    return { ...EMPTY_OPS_STOCK }
  }

  try {
    const totals = (await sql`
      select
        count(*)::int as product_count,
        count(*) filter (where current_qty <= 0)::int as zero_products,
        coalesce(sum(current_qty * coalesce(unit_cost, 0)), 0)::float as total_value
      from stock_products
    `) as { product_count: number; zero_products: number; total_value: number }[]

    let activeAlerts = 0
    if (await tableExists(sql, 'stock_alerts')) {
      const alerts = (await sql`
        select count(*)::int as n from stock_alerts where status = 'ativo'
      `) as { n: number }[]
      activeAlerts = n(alerts[0]?.n)
    }

    const localTotal = Math.round(n(totals[0]?.total_value) * 100) / 100
    const official = await fetchOfficialStockTotal(sql)
    const drift =
      official != null ? Math.round((localTotal - official) * 100) / 100 : null

    return {
      available: true,
      totalValue: localTotal,
      productCount: n(totals[0]?.product_count),
      activeAlerts,
      zeroProducts: n(totals[0]?.zero_products),
      drift,
    }
  } catch {
    return { ...EMPTY_OPS_STOCK }
  }
}
