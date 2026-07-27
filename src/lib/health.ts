import { getSql } from '@/lib/db'
import { getUnitConfigs } from '@/lib/unit-config'
import { isAuthEnabled, isProduction } from '@/lib/auth'
import { buildOverview } from '@/lib/live/overview'

async function probeUnitDb(url: string | null | undefined) {
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

/** Monitoramento externo — sem segredos e sem probe de DB (evita recon/DB load anônimo). */
export async function getPublicHealthStatus() {
  const configs = getUnitConfigs()
  return {
    ok: true,
    service: 'cerebro',
    units_configured: configs.filter((c) => Boolean(c.databaseUrl?.trim())).length,
    // Detalhe por unidade (connected/error) só no health autenticado.
  }
}

/** Admin logado — readiness completo pré-Avec. */
export async function getHealthStatus() {
  const configs = getUnitConfigs()
  const probes = await Promise.all(
    configs.map(async (c) => ({
      slug: c.meta.slug,
      name: c.meta.name,
      ...(await probeUnitDb(c.databaseUrl)),
    })),
  )

  let overview: Awaited<ReturnType<typeof buildOverview>> | null = null
  let overviewError: string | null = null
  try {
    overview = await buildOverview()
  } catch (e) {
    overviewError = e instanceof Error ? e.message : String(e)
  }

  const br = configs.find((c) => c.meta.slug === 'rom-brasil')
  const ig = configs.find((c) => c.meta.slug === 'rom-iguatemi')

  return {
    ok: probes.some((p) => p.connected) && (!isProduction() || isAuthEnabled()),
    readiness: {
      auth: isAuthEnabled(),
      // URLs já resolvidas (Brasil em *.neon.tech → null).
      brasil_supabase: Boolean(br?.databaseUrl),
      iguatemi_neon: Boolean(ig?.databaseUrl),
      // Compat com monitores antigos.
      neon_brasil: Boolean(br?.databaseUrl),
      neon_iguatemi: Boolean(ig?.databaseUrl),
      // Cérebro não guarda AVEC_API_TOKEN — sync vive nas unidades.
      awaiting_avec_token: false,
      note: 'Brasil=Supabase pooler · Iguatemi=Neon · sync Avec nas unidades ROM',
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
