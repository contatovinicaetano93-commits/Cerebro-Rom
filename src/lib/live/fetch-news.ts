import { evictSql, getSql, withDbTimeout } from '@/lib/db'
import { getUnitConfigs, UNIT_META } from '@/lib/unit-config'
import type { UnitSlug } from '@/lib/types'

export type CerebroNewsItem = {
  id: string
  unit: UnitSlug
  unitLabel: string
  kind: 'news' | 'event' | 'banner' | 'policy'
  title: string
  excerpt: string
  published_at: string | null
  href: string
}

function parseKind(value: unknown): CerebroNewsItem['kind'] {
  if (value === 'news' || value === 'event' || value === 'banner' || value === 'policy') return value
  return 'news'
}

function isMissingPosts(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return /intranet_posts|does not exist|relation|Timeout/i.test(msg)
}

async function fetchUnitNews(
  slug: UnitSlug,
  databaseUrl: string,
  panelUrl: string,
): Promise<CerebroNewsItem[]> {
  try {
    const sql = getSql(databaseUrl)
    const rows = await withDbTimeout(
      sql`
        select id, kind, title, excerpt, published_at
        from intranet_posts
        where published_at is not null
          and kind in ('news', 'event')
        order by published_at desc
        limit 6
      `,
      8_000,
      `news:${slug}`,
    )
    return (rows as Record<string, unknown>[]).map((row) => {
      const id = String(row.id)
      return {
        id,
        unit: slug,
        unitLabel: UNIT_META[slug].short,
        kind: parseKind(row.kind),
        title: String(row.title ?? ''),
        excerpt: String(row.excerpt ?? ''),
        published_at: row.published_at ? String(row.published_at) : null,
        href: `${panelUrl}/empresa/${id}`,
      }
    })
  } catch (error) {
    evictSql(databaseUrl)
    if (isMissingPosts(error)) return []
    throw error
  }
}

export async function fetchCerebroNews(): Promise<{
  items: CerebroNewsItem[]
  mode: 'live' | 'empty'
}> {
  const configs = getUnitConfigs().filter((c) => c.databaseUrl)
  if (configs.length === 0) {
    return { items: [], mode: 'empty' }
  }

  const batches = await Promise.all(
    configs.map(async (config) => {
      try {
        return await fetchUnitNews(
          config.meta.slug,
          config.databaseUrl!,
          config.meta.panelUrl,
        )
      } catch {
        return [] as CerebroNewsItem[]
      }
    }),
  )

  const items = batches
    .flat()
    .sort((a, b) => String(b.published_at ?? '').localeCompare(String(a.published_at ?? '')))
    .slice(0, 10)

  return { items, mode: items.length > 0 ? 'live' : 'empty' }
}
