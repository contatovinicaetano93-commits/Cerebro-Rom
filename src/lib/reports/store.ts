import { getCerebroSql, isCerebroDbConfigured, type Sql } from '@/lib/db'
import type { CerebroOverview, UnitSlug, UnitSnapshot } from '@/lib/types'
import { rate } from '@/lib/comparison'

export interface ReportRunMeta {
  id: string
  createdAt: string
  trigger: 'on_demand'
  mode: CerebroOverview['mode']
  periodLabel: string
  unitCount: number
  todayRevenue: number
  mtdRevenue: number
}

export interface ReportRunDetail extends ReportRunMeta {
  payload: CerebroOverview
}

export async function ensureReportTables(sql?: Sql): Promise<void> {
  const db = sql ?? getCerebroSql()
  await db`
    create table if not exists report_runs (
      id uuid primary key,
      created_at timestamptz not null default now(),
      trigger text not null default 'on_demand',
      mode text not null,
      period_label text not null,
      unit_count int not null default 0,
      today_revenue numeric not null default 0,
      mtd_revenue numeric not null default 0,
      payload jsonb not null
    )
  `
  await db`
    create index if not exists report_runs_created_idx
      on report_runs (created_at desc)
  `
  await db`
    create table if not exists report_unit_metrics (
      id uuid primary key,
      run_id uuid not null references report_runs (id) on delete cascade,
      captured_at timestamptz not null,
      unit_slug text not null,
      unit_short text not null,
      day date not null,
      revenue_today numeric not null default 0,
      appointments int not null default 0,
      attended int not null default 0,
      no_shows int not null default 0,
      cancelled int not null default 0,
      ticket_avg numeric not null default 0,
      capacity int not null default 0,
      daily_goal numeric not null default 0,
      goal_set boolean not null default false,
      occupancy_rate numeric,
      attendance_rate numeric,
      no_show_rate numeric,
      lost_revenue numeric not null default 0,
      open_slots_today int not null default 0,
      open_slots_next_2h int not null default 0,
      mtd_revenue numeric not null default 0,
      mtd_attended int not null default 0,
      mtd_ticket_avg numeric not null default 0,
      cmv numeric not null default 0,
      cmv_share numeric,
      payments_total numeric not null default 0,
      payment_reconcile text,
      top_payment_method text,
      packages_revenue numeric not null default 0,
      return_rate numeric not null default 0,
      stock_value numeric not null default 0,
      stock_alerts int not null default 0,
      stock_zero int not null default 0,
      sync_status text not null default 'stale',
      sync_label text not null default ''
    )
  `
  await db`
    create index if not exists report_unit_metrics_run_idx
      on report_unit_metrics (run_id)
  `
  await db`
    create index if not exists report_unit_metrics_day_idx
      on report_unit_metrics (day desc, unit_slug)
  `
}

function flatUnit(runId: string, capturedAt: string, u: UnitSnapshot) {
  const occupancy =
    u.today.capacitySet && u.today.capacity > 0
      ? rate(u.today.appointments, u.today.capacity)
      : null
  const attendance =
    u.today.appointments > 0 ? rate(u.today.attended, u.today.appointments) : null
  const noShowRate =
    u.today.appointments > 0 ? rate(u.today.noShows, u.today.appointments) : null
  const lostRevenue = Math.round((u.today.noShows + u.today.cancelled) * u.today.ticketAvg)

  return {
    id: crypto.randomUUID(),
    run_id: runId,
    captured_at: capturedAt,
    unit_slug: u.unit.slug as UnitSlug,
    unit_short: u.unit.short,
    day: u.today.day,
    revenue_today: u.today.revenue,
    appointments: u.today.appointments,
    attended: u.today.attended,
    no_shows: u.today.noShows,
    cancelled: u.today.cancelled,
    ticket_avg: u.today.ticketAvg,
    capacity: u.today.capacity,
    daily_goal: u.today.dailyGoal,
    goal_set: u.today.goalSet,
    occupancy_rate: occupancy,
    attendance_rate: attendance,
    no_show_rate: noShowRate,
    lost_revenue: lostRevenue,
    open_slots_today: u.opsToday.openSlotsToday,
    open_slots_next_2h: u.opsToday.openSlotsNext2h,
    mtd_revenue: u.opsFinance.mtdRevenue,
    mtd_attended: u.opsFinance.mtdAttended,
    mtd_ticket_avg: u.opsFinance.mtdTicketAvg,
    cmv: u.opsFinance.cmv,
    cmv_share: u.opsFinance.cmvShare,
    payments_total: u.opsFinance.paymentsTotal,
    payment_reconcile: u.opsFinance.paymentReconcile,
    top_payment_method: u.opsFinance.topPaymentMethod,
    packages_revenue: u.opsCommerce.packagesRevenue,
    return_rate: u.opsWeek.returnRate,
    stock_value: u.opsStock.totalValue,
    stock_alerts: u.opsStock.activeAlerts,
    stock_zero: u.opsStock.zeroProducts,
    sync_status: u.sync.status,
    sync_label: u.sync.label,
  }
}

/** Captura sob demanda o overview atual no Neon do Cérebro. */
export async function captureReportSnapshot(
  overview: CerebroOverview,
): Promise<ReportRunMeta> {
  if (!isCerebroDbConfigured()) {
    throw new Error('CEREBRO_DATABASE_URL não configurada')
  }
  const sql = getCerebroSql()
  await ensureReportTables(sql)

  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const unitCount = overview.units.length

  await sql`
    insert into report_runs (
      id, created_at, trigger, mode, period_label,
      unit_count, today_revenue, mtd_revenue, payload
    ) values (
      ${id},
      ${createdAt},
      ${'on_demand'},
      ${overview.mode},
      ${overview.periodLabel},
      ${unitCount},
      ${overview.consolidated.todayRevenue},
      ${overview.consolidated.mtdRevenue},
      ${JSON.stringify(overview)}
    )
  `

  for (const unit of overview.units) {
    const row = flatUnit(id, createdAt, unit)
    await sql`
      insert into report_unit_metrics (
        id, run_id, captured_at, unit_slug, unit_short, day,
        revenue_today, appointments, attended, no_shows, cancelled, ticket_avg,
        capacity, daily_goal, goal_set, occupancy_rate, attendance_rate, no_show_rate,
        lost_revenue, open_slots_today, open_slots_next_2h,
        mtd_revenue, mtd_attended, mtd_ticket_avg, cmv, cmv_share,
        payments_total, payment_reconcile, top_payment_method,
        packages_revenue, return_rate, stock_value, stock_alerts, stock_zero,
        sync_status, sync_label
      ) values (
        ${row.id}, ${row.run_id}, ${row.captured_at}, ${row.unit_slug}, ${row.unit_short}, ${row.day}::date,
        ${row.revenue_today}, ${row.appointments}, ${row.attended}, ${row.no_shows}, ${row.cancelled}, ${row.ticket_avg},
        ${row.capacity}, ${row.daily_goal}, ${row.goal_set}, ${row.occupancy_rate}, ${row.attendance_rate}, ${row.no_show_rate},
        ${row.lost_revenue}, ${row.open_slots_today}, ${row.open_slots_next_2h},
        ${row.mtd_revenue}, ${row.mtd_attended}, ${row.mtd_ticket_avg}, ${row.cmv}, ${row.cmv_share},
        ${row.payments_total}, ${row.payment_reconcile}, ${row.top_payment_method},
        ${row.packages_revenue}, ${row.return_rate}, ${row.stock_value}, ${row.stock_alerts}, ${row.stock_zero},
        ${row.sync_status}, ${row.sync_label}
      )
    `
  }

  return {
    id,
    createdAt,
    trigger: 'on_demand',
    mode: overview.mode,
    periodLabel: overview.periodLabel,
    unitCount,
    todayRevenue: overview.consolidated.todayRevenue,
    mtdRevenue: overview.consolidated.mtdRevenue,
  }
}

export async function listReportRuns(limit = 20): Promise<ReportRunMeta[]> {
  if (!isCerebroDbConfigured()) return []
  const sql = getCerebroSql()
  await ensureReportTables(sql)
  const rows = (await sql`
    select
      id,
      created_at,
      trigger,
      mode,
      period_label,
      unit_count,
      today_revenue::float as today_revenue,
      mtd_revenue::float as mtd_revenue
    from report_runs
    order by created_at desc
    limit ${limit}
  `) as {
    id: string
    created_at: string
    trigger: 'on_demand'
    mode: CerebroOverview['mode']
    period_label: string
    unit_count: number
    today_revenue: number
    mtd_revenue: number
  }[]

  return rows.map((r) => ({
    id: r.id,
    createdAt: new Date(r.created_at).toISOString(),
    trigger: r.trigger,
    mode: r.mode,
    periodLabel: r.period_label,
    unitCount: r.unit_count,
    todayRevenue: Number(r.today_revenue) || 0,
    mtdRevenue: Number(r.mtd_revenue) || 0,
  }))
}

export async function getReportRun(id: string): Promise<ReportRunDetail | null> {
  if (!isCerebroDbConfigured()) return null
  const sql = getCerebroSql()
  await ensureReportTables(sql)
  const rows = (await sql`
    select
      id,
      created_at,
      trigger,
      mode,
      period_label,
      unit_count,
      today_revenue::float as today_revenue,
      mtd_revenue::float as mtd_revenue,
      payload
    from report_runs
    where id = ${id}
    limit 1
  `) as {
    id: string
    created_at: string
    trigger: 'on_demand'
    mode: CerebroOverview['mode']
    period_label: string
    unit_count: number
    today_revenue: number
    mtd_revenue: number
    payload: CerebroOverview
  }[]

  const r = rows[0]
  if (!r) return null
  return {
    id: r.id,
    createdAt: new Date(r.created_at).toISOString(),
    trigger: r.trigger,
    mode: r.mode,
    periodLabel: r.period_label,
    unitCount: r.unit_count,
    todayRevenue: Number(r.today_revenue) || 0,
    mtdRevenue: Number(r.mtd_revenue) || 0,
    payload: r.payload,
  }
}
