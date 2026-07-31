import { getHealthStatus, type UnitHealthProbe } from '@/lib/health'
import { AlertManager } from '@/lib/alerts'

export interface HealthMetrics {
  ok: boolean
  issues: string[]
  timestamp: string
}

export class HealthMonitor {
  private static lastAlertId: Map<string, string> = new Map()

  static async checkHealth(): Promise<HealthMetrics> {
    const timestamp = new Date().toISOString()
    const issues: string[] = []

    try {
      const health = await getHealthStatus()

      if (!health.ok) {
        const message =
          'Connectivity/auth health check failed: no unit database is connected, or auth is disabled in production.'
        issues.push(message)
        await this.alertIfNew('connectivity_auth_failed', 'error', 'Health Connectivity/Auth Failed', message)
      }

      if (health.sync_ok === false) {
        const message = describeSyncHealthIssue(health.units)
        issues.push(message)
        await this.alertIfNew('sync_degraded', 'warning', 'Sync Health Degraded', message)
      }

      // Check unit databases
      if (health.units) {
        for (const unit of health.units) {
          if (!unit.connected) {
            issues.push(`Unit ${unit.slug} database offline: ${unit.error}`)
            await this.alertIfNew(`${unit.slug}_offline`, 'error', `${unit.slug} Database Offline`, unit.error || 'Unknown error')
          }
        }
      }
    } catch (e) {
      issues.push(`Health check error: ${e instanceof Error ? e.message : String(e)}`)
    }

    return {
      ok: issues.length === 0,
      issues,
      timestamp,
    }
  }

  /**
   * NÃO usar em Vercel/serverless — setInterval eterno + probes de DB.
   * Preferir cron externo espaçado ou checagem sob demanda.
   */
  static async startContinuousMonitoring(_intervalSeconds: number = 900): Promise<void> {
    throw new Error(
      'HealthMonitor.startContinuousMonitoring desabilitado (evita loop no DB). Use GET /api/health.',
    )
  }

  private static async alertIfNew(
    key: string,
    severity: 'warning' | 'error' | 'critical',
    title: string,
    message: string,
  ): Promise<void> {
    const lastId = this.lastAlertId.get(key)

    // Only alert if not recently alerted (debounce)
    if (lastId) {
      return
    }

    const alert = await AlertManager.createAlert(`health_degraded`, severity, title, message, { key })
    this.lastAlertId.set(key, alert.id)

    // Clear debounce after 1 hour
    setTimeout(() => this.lastAlertId.delete(key), 60 * 60 * 1000)

    // Send notifications
    await AlertManager.sendAlert(alert, {
      telegram: severity === 'critical' || severity === 'error',
      email: severity === 'critical',
    })
  }
}

function describeSyncHealthIssue(units: UnitHealthProbe[]): string {
  const syncIssues = units
    .filter((unit) => unit.connected)
    .flatMap((unit) => describeUnitSyncIssues(unit))

  if (syncIssues.length === 0) {
    return 'Sync health degraded: sync probe reported an operational issue.'
  }

  return `Sync health degraded: ${syncIssues.join('; ')}`
}

function describeUnitSyncIssues(unit: UnitHealthProbe): string[] {
  const sync = unit.sync
  if (sync == null) {
    return [`${unit.slug} sync metadata unavailable`]
  }

  const issues: string[] = []
  if (sync.fast_status === 'error' || sync.fast_status === 'partial') {
    issues.push(`${unit.slug} fast sync ${sync.fast_status}`)
  }
  if (sync.full_status === 'error' || sync.full_status === 'partial') {
    issues.push(`${unit.slug} full sync ${sync.full_status}`)
  }

  if (!sync.running) {
    if (sync.fast_status == null && sync.full_status == null) {
      issues.push(`${unit.slug} sync metadata has no finished runs`)
    }
    if (sync.fast_age_min != null && sync.fast_age_min > 60) {
      issues.push(`${unit.slug} fast sync stale (${sync.fast_age_min} min)`)
    }
    if (sync.full_age_min != null && sync.full_age_min > 24 * 60) {
      issues.push(`${unit.slug} full sync stale (${sync.full_age_min} min)`)
    }
  }

  return issues
}
