import * as Sentry from '@sentry/nextjs'
import posthog from 'posthog-js'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
})

const posthogToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
if (posthogToken) {
  posthog.init(posthogToken, {
    api_host: '/ingest',
    ui_host: 'https://us.posthog.com',
    defaults: '2026-01-30',
    // Painel executivo: receita por unidade e desempenho por profissional na
    // tela. Session Replay fica desligado no código, não na config do PostHog.
    disable_session_recording: true,
    capture_exceptions: true,
    debug: process.env.NODE_ENV === 'development',
  })
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
