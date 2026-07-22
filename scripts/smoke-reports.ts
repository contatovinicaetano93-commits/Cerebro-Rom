import { readFileSync } from 'fs'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]
}

async function main() {
  const { isCerebroDbConfigured } = await import('../src/lib/db')
  const { captureReportSnapshot, listReportRuns, getReportRun } = await import(
    '../src/lib/reports/store'
  )
  const { buildReportCsv, buildReportXlsx } = await import('../src/lib/reports/export')
  const { buildOverview } = await import('../src/lib/live/overview')

  console.log('configured', isCerebroDbConfigured())
  const overview = await buildOverview()
  console.log(
    'mode',
    overview.mode,
    'units',
    overview.units.length,
    'rev',
    overview.consolidated.todayRevenue,
  )
  const run = await captureReportSnapshot(overview)
  console.log('captured', run.id, run.createdAt)
  const listed = await listReportRuns(3)
  console.log('listed', listed.length, listed[0]?.id)
  const detail = await getReportRun(run.id)
  if (!detail) throw new Error('missing detail')
  const csv = buildReportCsv(detail)
  const xlsx = await buildReportXlsx(detail)
  console.log('csv bytes', csv.length, 'xlsx bytes', xlsx.length)
  console.log('OK')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
