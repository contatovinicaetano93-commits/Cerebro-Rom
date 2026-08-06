import { getUnitConfigs } from '@/lib/unit-config'
import { isAuthEnabled, isProduction } from '@/lib/auth'
import { evictSql, getSql, withDbTimeout } from '@/lib/db'
import {
  computeSyncOk,
  pickHealthFinishedRun,
  type UnitHealthProbe,
  type UnitSyncMeta,
  type UnitSyncRunProbeRow,
} from '@/lib/health-sync'
import { isEmptyKillError } from '@/lib/live/sync-status'

export type { UnitHealthProbe, UnitSyncMeta }
export { computeSyncOk }

/**
 * Tetos curtos de propósito: health precisa RESPONDER quando o banco está ruim.
 * Sem eles a função pendurava até o limite da plataforma (300s em produção) e o
 * diagnóstico travava junto com o problema que devia diagnosticar.
 */
const PROBE_PING_TIMEOUT_MS = 6_000
const PROBE_SYNC_TIMEOUT_MS = 8_000

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
    await withDbTimeout(sql`select 1 as ok`, PROBE_PING_TIMEOUT_MS, 'ping da unidade')
    let sync: UnitSyncMeta | null = null
    try {
      // Uma query — Promise.all no pool max:1/2 enfileirava e podia travar o probe.
      type SyncProbeRow = UnitSyncRunProbeRow & { kind: string; running: string }
      const recent = (await withDbTimeout(
        sql`
          select
            status,
            created_at,
            error,
            kind,
            coalesce(stats->>'running', 'false') as running
          from avec_sync_runs
          where kind in ('fast', 'full')
          order by created_at desc
          limit 40
        `,
        PROBE_SYNC_TIMEOUT_MS,
        'leitura de avec_sync_runs',
      )) as SyncProbeRow[]
      const fastRows = recent.filter((r) => r.kind === 'fast' && r.running !== 'true').slice(0, 5)
      const fullRows = recent.filter((r) => r.kind === 'full' && r.running !== 'true').slice(0, 5)
      const fast = pickHealthFinishedRun(fastRows, isEmptyKillError)
      const full = pickHealthFinishedRun(fullRows, isEmptyKillError)
      const ageMin = (at: string | undefined) =>
        at != null ? Math.round((Date.now() - new Date(at).getTime()) / 60_000) : null
      sync = {
        fast_status: fast?.status ?? null,
        fast_age_min: ageMin(fast?.created_at),
        full_status: full?.status ?? null,
        full_age_min: ageMin(full?.created_at),
        running: recent.some((r) => r.running === 'true'),
      }
    } catch {
      sync = null
    }
    return { configured: true, connected: true, error: null, sync }
  } catch (e) {
    // Client preso (pooler sem slot) não pode ser herdado pela próxima invocação.
    evictSql(url)
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
  const units_configured = configs.filter((c) => Boolean(c.databaseUrl?.trim())).length
  return {
    ok: units_configured > 0,
    service: 'cerebro',
    units_configured,
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
      unit_brasil: Boolean(br?.databaseUrl),
      unit_iguatemi: Boolean(ig?.databaseUrl),
      // Aliases Neon (legado): sempre false — unidades usam Supabase pooler.
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
