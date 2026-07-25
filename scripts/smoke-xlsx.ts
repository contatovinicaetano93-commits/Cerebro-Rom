import { writeFileSync } from 'node:fs'
import { buildMockOverview } from '../src/lib/mock-overview'
import { buildReportXlsx } from '../src/lib/reports/export'
import type { ReportRunDetail } from '../src/lib/reports/store'

async function main() {
  const overview = buildMockOverview()
  const run: ReportRunDetail = {
    id: 'smoke',
    createdAt: new Date().toISOString(),
    trigger: 'on_demand',
    mode: overview.mode,
    periodLabel: overview.periodLabel,
    unitCount: overview.units.length,
    todayRevenue: overview.consolidated.todayRevenue,
    mtdRevenue: overview.consolidated.mtdRevenue,
    payload: overview,
  }
  const buf = await buildReportXlsx(run)
  writeFileSync('/tmp/cerebro-report.xlsx', buf)
  console.log('xlsx bytes', buf.length)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
