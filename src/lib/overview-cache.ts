import { MemoryCache } from '@/lib/cache'
import { RequestDeduplicator } from '@/lib/deduplicator'
import { todayIsoSaoPaulo } from '@/lib/unit-config'
import { buildOverview } from '@/lib/live/overview'
import type { CerebroOverview } from '@/lib/types'

/** TTL curto — painel pode pollar; não martelar Supabase a cada request. */
const OVERVIEW_CACHE_TTL_S = 45

export function overviewCacheKey(day = todayIsoSaoPaulo()): string {
  return `overview:live:${day}`
}

export function invalidateOverviewCache(): void {
  MemoryCache.delete(overviewCacheKey())
  MemoryCache.delete('overview:live')
}

/**
 * Overview live com dedupe in-flight + cache 45s.
 * Não cacheia `degraded` (blip não trava o painel).
 * `fresh: true` ignora cache (pós-save de metas / captura explícita).
 */
export async function getCachedLiveOverview(opts?: {
  fresh?: boolean
}): Promise<CerebroOverview> {
  const key = overviewCacheKey()
  if (opts?.fresh) invalidateOverviewCache()

  return RequestDeduplicator.deduplicate(`${key}:${opts?.fresh ? 'fresh' : 'cache'}`, async () => {
    if (!opts?.fresh) {
      const cached = MemoryCache.get<CerebroOverview>(key)
      if (cached) return cached
    }

    const next = await buildOverview()
    if (next.mode === 'live') {
      MemoryCache.set(key, next, OVERVIEW_CACHE_TTL_S)
    }
    return next
  })
}
