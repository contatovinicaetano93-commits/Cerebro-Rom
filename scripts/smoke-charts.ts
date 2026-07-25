import { buildMockOverview } from '../src/lib/mock-overview'
import { debugWriteCharts } from '../src/lib/reports/charts'

async function main() {
  const dir = await debugWriteCharts(buildMockOverview())
  console.log('wrote', dir)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
