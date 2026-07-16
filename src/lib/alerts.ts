export interface Alert {
  id: string
  type: 'sync_failed' | 'sync_timeout' | 'health_degraded'
  severity: 'warning' | 'error' | 'critical'
  title: string
  message: string
  context: Record<string, any>
  created_at: string
  resolved_at: string | null
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export class AlertManager {
  static async createAlert(
    type: Alert['type'],
    severity: Alert['severity'],
    title: string,
    message: string,
    context?: Record<string, any>,
  ): Promise<Alert> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    const alert = {
      id,
      type,
      severity,
      title,
      message,
      context: context || {},
      created_at: now,
      resolved_at: null,
    }

    // Cerebro não persiste alerts no DB — apenas envia notificações
    console.warn(`[ALERT] ${type}: ${title}`)

    return alert
  }

  static async sendAlert(
    alert: Alert,
    channels?: { telegram?: boolean; email?: boolean; webhook?: string },
  ): Promise<void> {
    const message = this.formatMessage(alert)

    if (channels?.telegram) {
      await this.sendTelegram(message, alert.severity)
    }

    if (channels?.email) {
      await this.sendEmail(alert)
    }

    if (channels?.webhook) {
      await this.sendWebhook(channels.webhook, alert)
    }
  }

  private static formatMessage(alert: Alert): string {
    const severity_badge = {
      warning: '⚠️',
      error: '❌',
      critical: '🚨',
    }[alert.severity]

    return `${severity_badge} [${alert.type.toUpperCase()}] ${alert.title}\n\n${alert.message}`
  }

  private static async sendTelegram(message: string, severity: Alert['severity']): Promise<void> {
    const botToken = process.env.TELEGRAM_ALERTS_BOT_TOKEN
    const chatId = process.env.TELEGRAM_ALERTS_CHAT_ID

    if (!botToken || !chatId) {
      console.warn('[ALERT] Telegram not configured')
      return
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown',
        }),
      })
      if (!res.ok) {
        console.error(`[ALERT] Telegram HTTP ${res.status}: ${await res.text().catch(() => '')}`)
      }
    } catch (e) {
      console.error('[ALERT] Failed to send Telegram:', e)
    }
  }

  private static async sendEmail(alert: Alert): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY?.trim()
    const emailTo = process.env.ALERT_EMAIL_TO?.trim()
    const from =
      process.env.RESEND_FROM?.trim() || 'Cérebro ROM <onboarding@resend.dev>'

    if (!apiKey) {
      console.warn('[ALERT] RESEND_API_KEY not configured')
      return
    }

    if (!emailTo) {
      console.warn('[ALERT] ALERT_EMAIL_TO not configured')
      return
    }

    const to = emailTo.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean)
    if (to.length === 0) {
      console.warn('[ALERT] ALERT_EMAIL_TO empty after parse')
      return
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from,
          to,
          subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
          html: `<p>${escapeHtml(alert.message)}</p><p><small>${escapeHtml(
            alert.context ? JSON.stringify(alert.context) : '',
          )}</small></p>`,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string }
        console.error(
          `[ALERT] Resend HTTP ${res.status}: ${body.message ?? 'unknown error'}`,
        )
      }
    } catch (e) {
      console.error('[ALERT] Failed to send email:', e)
    }
  }

  private static async sendWebhook(webhook: string, alert: Alert): Promise<void> {
    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: alert.type,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          timestamp: alert.created_at,
        }),
      })
    } catch (e) {
      console.error('[ALERT] Failed to send webhook:', e)
    }
  }
}
