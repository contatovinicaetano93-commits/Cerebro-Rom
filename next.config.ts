import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  serverExternalPackages: ['exceljs', 'postgres'],
  // Overlay secrets/neon-iguatemi-database-url.txt no bundle serverless.
  outputFileTracingIncludes: {
    '/*': ['./secrets/**/*'],
    '/api/*': ['./secrets/**/*'],
    '/api/**/*': ['./secrets/**/*'],
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
