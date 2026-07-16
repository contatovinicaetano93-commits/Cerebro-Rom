import { getHealthStatus, getPublicHealthStatus } from '@/lib/health'
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
        issues.push('Overall health check failed')
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

  static async startContinuousMonitoring(intervalSeconds: number = 300): Promise<void> {
    // Check immediately
    await this.checkHealth()

    // Then check periodically
    setInterval(() => this.checkHealth().catch(console.error), intervalSeconds * 1000)
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
