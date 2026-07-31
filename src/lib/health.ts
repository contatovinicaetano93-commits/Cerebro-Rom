import { getUnitConfigs } from '@/lib/unit-config'
import { isAuthEnabled, isProduction } from '@/lib/auth'
import { getSql } from '@/lib/db'
import {
  computeSyncOk,
  type UnitHealthProbe,
  type UnitSyncMeta,
} from '@/lib/health-sync'

export type { UnitHealthProbe, UnitSyncMeta }
export { computeSyncOk }

async function probeUnitDb(url: string | null | undefined) {
  if (!url?.trim()) {
    return {
      configured: false,
      connected: false,
      error: null as string | null,
      sync: null as UnitSyncMeta | null,
    }
  }
  try {
    const sql = getSql(url)
    await sql`select 1 as ok`
    let sync: UnitSyncMeta | null = null
    try {
      const [fastRows, fullRows, runningRows] = await Promise.all([
        sql`
          select status, created_at
          from avec_sync_runs
          where kind = 'fast' and coalesce(stats->>'running', 'false') <> 'true'
          order by created_at desc limit 1
        `,
        sql`
          select status, created_at
          from avec_sync_runs
          where kind = 'full' and coalesce(stats->>'running', 'false') <> 'true'
          order by created_at desc limit 1
        `,
        sql`
          select 1 as n from avec_sync_runs
          where kind in ('fast', 'full') and coalesce(stats->>'running', 'false') = 'true'
          limit 1
        `,
      ])
      const fast = (fastRows as { status: string; created_at: string }[])[0]
      const full = (fullRows as { status: string; created_at: string }[])[0]
      const ageMin = (at: string | undefined) =>
        at != null ? Math.round((Date.now() - new Date(at).getTime()) / 60_000) : null
      sync = {
        fast_status: fast?.status ?? null,
        fast_age_min: ageMin(fast?.created_at),
        full_status: full?.status ?? null,
        full_age_min: ageMin(full?.created_at),
        running: (runningRows as { n: number }[]).length > 0,
      }
    } catch {
      sync = null
    }
    return { configured: true, connected: true, error: null, sync }
  } catch (e) {
    return {
      configured: true,
      connected: false,
      error: e instanceof Error ? e.message : String(e),
      sync: null,
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
 * `ok` = liveness (DB+auth). `sync_ok` = sync operacional (error/partial/stale).
 */
export async function getHealthStatus() {
  const configs = getUnitConfigs()
  const probes: UnitHealthProbe[] = await Promise.all(
    configs.map(async (c) => ({
      slug: c.meta.slug,
      name: c.meta.name,
      ...(await probeUnitDb(c.databaseUrl)),
    })),
  )
  const syncOk = computeSyncOk(probes)

  const br = configs.find((c) => c.meta.slug === 'rom-brasil')
  const ig = configs.find((c) => c.meta.slug === 'rom-iguatemi')

  return {
    ok: probes.some((p) => p.connected) && (!isProduction() || isAuthEnabled()),
    sync_ok: syncOk,
    readiness: {
      auth: isAuthEnabled(),
      sync_ok: syncOk,
      brasil_supabase: Boolean(br?.databaseUrl),
      iguatemi_supabase: Boolean(ig?.databaseUrl),
      // Aliases Neon: sempre false (unidades não usam mais Neon).
      iguatemi_neon: false,
      neon_brasil: false,
      neon_iguatemi: false,
      awaiting_avec_token: false,
      note: 'Brasil+Iguatemi=Supabase pooler · health faz probe leve + meta de sync/sync_ok (overview em /api/overview)',
    },
    units: probes,
    // Overview completo fica em GET /api/overview — evita 2× carga no DB.
    overview: null,
    overview_error: null,
  }
}
