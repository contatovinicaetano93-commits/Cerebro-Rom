import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  serverExternalPackages: ['exceljs', 'pureimage'],
  // Fontes TTF usadas nos gráficos PNG do XLSX (pureimage).
  outputFileTracingIncludes: {
    '/api/reports/**': ['./src/lib/reports/fonts/**'],
    '/api/reports/[id]/**': ['./src/lib/reports/fonts/**'],
  },
}

export default withSentryConfig(nextConfig, {
  org: 'imobi-hl',
  project: 'rom-cerebro',
  silent: !process.env.CI,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  tunnelRoute: '/monitoring',
})
