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
  // Mesmo piso de R$50 do paymentGap — evita “gap 0” com status divergent.
  const tolerance = Math.max(50, Math.round(revenue * 0.01 * 100) / 100)
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

/** Snapshots 0045 mais velhos que isto → unknown (não inventar drift com stock antigo). */
const STOCK_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/** Soma valorização oficial Avec 0045 a partir do snapshot bruto (quando existir). */
async function fetchOfficialStockTotal(sql: Sql): Promise<number | null> {
  if (!(await tableExists(sql, 'avec_report_snapshots'))) return null
  try {
    // Schema real (BR/IG Supabase): fetched_at — não created_at.
    const rows = (await sql`
      select payload, fetched_at
      from avec_report_snapshots
      where report_id = '0045'
      order by fetched_at desc nulls last
      limit 1
    `) as { payload: unknown; fetched_at: string | Date | null }[]
    const row = rows[0]
    if (!row || !Array.isArray(row.payload) || row.payload.length === 0) return null
    const captured = row.fetched_at ? new Date(row.fetched_at).getTime() : NaN
    if (Number.isFinite(captured) && Date.now() - captured > STOCK_SNAPSHOT_MAX_AGE_MS) {
      return null
    }
    let sum = 0
    let hit = 0
    for (const item of row.payload) {
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
  mtdTicketAvg: null,
  cmv: 0,
  cmvKnown: false,
  cmvShare: null,
  paymentsTotal: 0,
  paymentsKnown: false,
  paymentGap: null,
  paymentReconcile: 'unknown',
  topPaymentMethod: null,
  available: false,
}

export const EMPTY_OPS_STOCK: OpsStock = {
  available: false,
  valueKnown: false,
  totalValue: 0,
  productCount: 0,
  activeAlerts: 0,
  alertsKnown: false,
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
  const mtdTicketAvg = mtdAttended > 0 ? Math.round(mtdRevenue / mtdAttended) : null

  let cmv = 0
  let cmvOk = false
  if (await tableExists(sql, 'stock_movements')) {
    try {
      const rows = (await sql`
        select
          coalesce(sum(
            coalesce(
              sm.cost,
              sm.quantity * coalesce(sp.unit_cost, sp.avg_cost, 0)
            )
          ), 0)::float as cmv,
          count(*)::int as n
        from stock_movements sm
        left join stock_products sp on sp.id = sm.product_id
        where sm.type = 'saida'
          and (sm.occurred_at at time zone 'America/Sao_Paulo')::date >= ${monthStart}::date
          and (sm.occurred_at at time zone 'America/Sao_Paulo')::date <= ${today}::date
      `) as { cmv: number; n: number }[]
      cmv = Math.round(n(rows[0]?.cmv) * 100) / 100
      // Sem saídas OU saídas sem custo → unknown (não pintar CMV R$0 / 0% como saudável).
      cmvOk = n(rows[0]?.n) > 0 && cmv > 0
    } catch {
      cmv = 0
    }
  }

  let paymentsTotal = 0
  let pairedRevenue = 0
  let topPaymentMethod: string | null = null
  let mixOk = false
  if (await tableExists(sql, 'salon_p2_daily')) {
    try {
      // Casa 0081 com receita do MESMO dia — somar mix do mês contra MTD
      // inteiro inventa gap quando faltam dias de pagamento (BR) ou distorce IG.
      const rows = (await sql`
        select
          coalesce(d.revenue, 0)::float as revenue,
          p.payment_mix
        from salon_p2_daily p
        inner join salon_daily_metrics d on d.day = p.day
        where p.day >= ${monthStart}::date
          and p.day <= ${today}::date
      `) as { revenue: number; payment_mix: unknown }[]

      const byMethod = new Map<string, number>()
      for (const row of rows) {
        const mix = Array.isArray(row.payment_mix) ? row.payment_mix : []
        let dayPay = 0
        for (const item of mix) {
          if (item == null || typeof item !== 'object') continue
          const rec = item as Record<string, unknown>
          const method = typeof rec.method === 'string' ? rec.method.trim() : ''
          if (!method) continue
          const amount = n(rec.amount)
          if (amount === 0) continue
          byMethod.set(method, (byMethod.get(method) ?? 0) + amount)
          dayPay += amount
        }
        if (dayPay <= 0) continue
        paymentsTotal += dayPay
        pairedRevenue += n(row.revenue)
      }
      for (const [method, amount] of byMethod) {
        if (topPaymentMethod == null || amount > (byMethod.get(topPaymentMethod) ?? 0)) {
          topPaymentMethod = method
        }
      }
      paymentsTotal = Math.round(paymentsTotal * 100) / 100
      pairedRevenue = Math.round(pairedRevenue * 100) / 100
      mixOk = byMethod.size > 0 && paymentsTotal > 0
    } catch {
      // ok
    }
  }

  // Conciliação e gap usam receita dos dias com 0081 (pareado), não o MTD cheio.
  const reconcileBase = mixOk && pairedRevenue > 0 ? pairedRevenue : mtdRevenue
  const cmvShare = cmvOk && mtdRevenue > 0 ? cmv / mtdRevenue : null
  const rawGap = mixOk ? Math.round((paymentsTotal - reconcileBase) * 100) / 100 : null
  // Ruído de centavos/arredondamento — não pintar −R$28 como “dado”.
  const paymentGap =
    rawGap == null ? null : Math.abs(rawGap) < 50 ? 0 : rawGap

  return {
    mtdRevenue,
    mtdAttended,
    mtdTicketAvg,
    cmv: cmvOk ? cmv : 0,
    cmvKnown: cmvOk,
    cmvShare,
    paymentsTotal: mixOk ? paymentsTotal : 0,
    paymentsKnown: mixOk,
    paymentGap,
    paymentReconcile: mixOk ? reconcile(reconcileBase, paymentsTotal) : 'unknown',
    topPaymentMethod: mixOk ? topPaymentMethod : null,
    // Disponível se há qualquer fonte Avec financeira — não inventa CMV/0081 via só MTD.
    available: cmvOk || mixOk || mtdRevenue > 0,
  }
}

/** Estoque Avec — tabelas sync; ausência → available:false sem quebrar overview. */
export async function fetchOpsStock(sql: Sql): Promise<OpsStock> {
  if (!(await tableExists(sql, 'stock_products'))) {
    return { ...EMPTY_OPS_STOCK }
  }

  try {
    // Valor: coalesce unit_cost/avg_cost (paridade ROM). Zerados: só SKUs com
    // mínimo definido ou custo — evita contar catálogo morto sem estoque nunca.
    const totals = (await sql`
      select
        count(*)::int as product_count,
        count(*) filter (
          where current_qty <= 0
            and (
              minimum_qty is not null
              or coalesce(unit_cost, avg_cost, 0) > 0
              or coalesce(unit_price, 0) > 0
            )
        )::int as zero_products,
        coalesce(
          sum(greatest(current_qty, 0) * coalesce(unit_cost, avg_cost, 0)),
          0
        )::float as total_value
      from stock_products
    `) as { product_count: number; zero_products: number; total_value: number }[]

    let activeAlerts = 0
    let alertsTableRows = 0
    if (await tableExists(sql, 'stock_alerts')) {
      const alerts = (await sql`
        select
          count(*)::int as total,
          count(*) filter (where status = 'ativo')::int as n
        from stock_alerts
      `) as { total: number; n: number }[]
      alertsTableRows = n(alerts[0]?.total)
      activeAlerts = n(alerts[0]?.n)
    }

    const localTotal = Math.round(n(totals[0]?.total_value) * 100) / 100
    const productCount = n(totals[0]?.product_count)
    const zeroProducts = n(totals[0]?.zero_products)
    // Tabela vazia (só schema) ≠ posição sincronizada — não pintar estoque R$0 conhecido.
    if (productCount <= 0 && activeAlerts <= 0 && localTotal <= 0) {
      return { ...EMPTY_OPS_STOCK }
    }

    const official = await fetchOfficialStockTotal(sql)
    // Valorização conhecida só com custo local > 0 (0045 sozinho não inventa R$0).
    const valueKnown = localTotal > 0
    const drift =
      valueKnown && official != null
        ? Math.round((localTotal - official) * 100) / 100
        : null

    // Catálogo com tabela de alertas vazia = sync ausente (não “0 ok”), mesmo com poucos zerados.
    const alertsKnown = alertsTableRows > 0 || activeAlerts > 0

    return {
      available: true,
      valueKnown,
      totalValue: valueKnown ? localTotal : 0,
      productCount,
      activeAlerts: alertsKnown ? activeAlerts : 0,
      alertsKnown,
      zeroProducts,
      drift,
    }
  } catch {
    return { ...EMPTY_OPS_STOCK }
  }
}
