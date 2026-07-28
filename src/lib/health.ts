import { getUnitConfigs } from '@/lib/unit-config'
import { isAuthEnabled, isProduction } from '@/lib/auth'
import { getCerebroSql, getSql, isCerebroDbConfigured } from '@/lib/db'

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

/** Probe Cérebro's own Neon DB (CEREBRO_DATABASE_URL). */
async function probeNeonCerebro(): Promise<{ configured: boolean; connected: boolean; error: string | null }> {
  if (!isCerebroDbConfigured()) return { configured: false, connected: false, error: null }
  try {
    const sql = getCerebroSql()
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

/**
 * Admin logado — readiness leve.
 * Não chama buildOverview (dobraria leituras nos DBs das unidades).
 */
export async function getHealthStatus() {
  const configs = getUnitConfigs()
  const [probes, cerebroNeon] = await Promise.all([
    Promise.all(
      configs.map(async (c) => ({
        slug: c.meta.slug,
        name: c.meta.name,
        ...(await probeUnitDb(c.databaseUrl)),
      })),
    ),
    probeNeonCerebro(),
  ])

  const br = configs.find((c) => c.meta.slug === 'rom-brasil')
  const ig = configs.find((c) => c.meta.slug === 'rom-iguatemi')

  return {
    ok: probes.some((p) => p.connected) && (!isProduction() || isAuthEnabled()),
    readiness: {
      auth: isAuthEnabled(),
      brasil_supabase: Boolean(br?.databaseUrl),
      iguatemi_supabase: Boolean(ig?.databaseUrl),
      // Cérebro's own DB is Neon (CEREBRO_DATABASE_URL) — units are Supabase.
      cerebro_neon: cerebroNeon.configured,
      // Aliases Neon: always false (units no longer use Neon).
      iguatemi_neon: false,
      neon_brasil: false,
      neon_iguatemi: false,
      awaiting_avec_token: false,
      note: 'Cérebro=Neon · Brasil+Iguatemi=Supabase pooler · health só faz select 1 (overview em /api/overview)',
    },
    units: probes,
    cerebro_db: cerebroNeon,
    // Overview completo fica em GET /api/overview — evita 2× carga no DB.
    overview: null,
    overview_error: null,
  }
}
