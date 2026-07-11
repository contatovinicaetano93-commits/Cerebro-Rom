import { getSql } from '@/lib/db'
import { getUnitConfigs } from '@/lib/unit-config'
import { isAuthEnabled, isProduction } from '@/lib/auth'
import { buildOverview } from '@/lib/live/overview'

function envOk(name: string) {
  return Boolean(process.env[name]?.trim())
}

async function probeNeon(url: string | null | undefined) {
  if (!url?.trim()) return { configured: false, connected: false, error: null as string | null }
  try {
    const sql = getSql(url)
    await sql`select 1 as ok`
    return { configured: true, connected: true, error: null }
  } catch (e) {
    return {
      configured: true,
      connected: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

/** Monitoramento externo — sem segredos. */
export async function getPublicHealthStatus() {
  const configs = getUnitConfigs()
  const probes = await Promise.all(
    configs.map(async (c) => ({
      slug: c.meta.slug,
      ...(await probeNeon(c.databaseUrl)),
    })),
  )
  const anyConnected = probes.some((p) => p.connected)
  return {
    ok: anyConnected || !isProduction(),
    units: probes,
  }
}

/** Admin logado — readiness completo pré-Avec. */
export async function getHealthStatus() {
  const configs = getUnitConfigs()
  const probes = await Promise.all(
    configs.map(async (c) => ({
      slug: c.meta.slug,
      name: c.meta.name,
      ...(await probeNeon(c.databaseUrl)),
    })),
  )

  let overview: Awaited<ReturnType<typeof buildOverview>> | null = null
  let overviewError: string | null = null
  try {
    overview = await buildOverview()
  } catch (e) {
    overviewError = e instanceof Error ? e.message : String(e)
  }

  return {
    ok: probes.some((p) => p.connected) && (!isProduction() || isAuthEnabled()),
    readiness: {
      auth: isAuthEnabled(),
      neon_brasil: envOk('NEON_BRASIL_DATABASE_URL'),
      neon_iguatemi: envOk('NEON_IGUATEMI_DATABASE_URL'),
      awaiting_avec_token: true,
      note: 'KPIs Avec dependem de AVEC_API_TOKEN nas unidades ROM (terça)',
    },
    units: probes,
    overview: overview
      ? {
          mode: overview.mode,
          partial: overview.partial ?? false,
          unit_count: overview.units.length,
          next_actions: overview.nextActions.length,
        }
      : null,
    overview_error: overviewError,
  }
}
