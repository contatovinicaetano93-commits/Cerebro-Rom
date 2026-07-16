# Graph Report - cerebro-rom  (2026-07-14)

## Corpus Check
- 44 files · ~12,768 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 283 nodes · 474 edges · 24 communities (15 shown, 9 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c62b1cdd`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `isProduction()` - 13 edges
3. `fetchLiveUnit()` - 12 edges
4. `buildOverview()` - 12 edges
5. `isAuthEnabled()` - 9 edges
6. `isAuthorized()` - 9 edges
7. `fetchOpsWeek()` - 9 edges
8. `getHealthStatus()` - 8 edges
9. `buildLiveOverview()` - 8 edges
10. `getUnitConfigs()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `checkOverview()` --calls--> `buildOverview()`  [EXTRACTED]
  scripts/smoke-full.ts → src/lib/live/overview.ts
- `POST()` --calls--> `isProduction()`  [EXTRACTED]
  src/app/api/auth/logout/route.ts → src/lib/auth.ts
- `GET()` --calls--> `buildOverview()`  [EXTRACTED]
  src/app/api/overview/route.ts → src/lib/live/overview.ts
- `buildOverview()` --calls--> `isProduction()`  [EXTRACTED]
  src/lib/live/overview.ts → src/lib/auth.ts
- `rate()` --calls--> `clamp01()`  [EXTRACTED]
  src/lib/comparison.ts → src/lib/format.ts

## Import Cycles
- None detected.

## Communities (24 total, 9 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.11
Nodes (39): buildComparison(), leaderBy(), rate(), buildMockOverview(), buildSeries(), buildUnit(), isoDaysBack(), seeded() (+31 more)

### Community 1 - "Community 1"
Cohesion: 0.11
Nodes (15): CollapsibleSection(), SectionControls(), Dashboard(), DEFAULT_OPEN, SectionKey, unitName(), LogoutButton(), KpiStat() (+7 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (26): dependencies, lucide-react, @neondatabase/serverless, next, react, react-dom, recharts, devDependencies (+18 more)

### Community 3 - "Community 3"
Cohesion: 0.16
Nodes (22): getSql(), Sql, probeNeon(), asArray(), EMPTY_OPS_COMMERCE, EMPTY_OPS_WEEK, fetchLatestP1(), fetchLatestP2() (+14 more)

### Community 4 - "Community 4"
Cohesion: 0.23
Nodes (18): GET(), createSessionToken(), getAdminPassword(), getAdminUser(), isAuthEnabled(), isAuthorized(), isProduction(), timingSafeEqual() (+10 more)

### Community 5 - "Community 5"
Cohesion: 0.10
Nodes (19): Cron automático (pós-terça), Cérebro, Domingo — banco e simulação, O que já funciona sem token, Preparação até terça (token Avec), Rollback, ROM Brasil, ROM Iguatemi (+11 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (15): Checklist (cada unidade), O que já está pronto (sem token), Quando o AVEC_API_TOKEN chegar, ROM Brasil (`rom-club`), ROM Iguatemi (`rom-iguatemi`), Teste opcional com mock (só local), Auth (Waltter), Cérebro · Painel Waltter (+7 more)

### Community 8 - "Community 8"
Cohesion: 0.29
Nodes (12): checkHttp(), checkNeon(), checkOverview(), __dir, fail(), HTTP_CHECKS, loadEnvLocal(), main() (+4 more)

### Community 9 - "Community 9"
Cohesion: 0.29
Nodes (12): checkCerebroOverview(), checkHttp(), checkNeon(), __dir, fail(), HTTP_CHECKS, loadEnvLocal(), main() (+4 more)

### Community 10 - "Community 10"
Cohesion: 0.25
Nodes (7): Cérebro ROM — acesso Waltter, Link (Vercel), Login, Mensagem pronta (WhatsApp), No celular (atalho), O que é cada sistema, Rotina sugerida

### Community 11 - "Community 11"
Cohesion: 0.25
Nodes (7): Env opcional (Vercel de cada ROM), O que entra no Cérebro (P0), O que NÃO entra no P0 (de propósito), P0 — KPIs de operação (Avec), Relatórios Avec usados (mínimo), Sync (ROMs), UI

### Community 12 - "Community 12"
Cohesion: 0.33
Nodes (5): Camadas, Cérebro ROM — mapa único, Neon, Resiliência (sem gaps), Token

### Community 13 - "Community 13"
Cohesion: 0.40
Nodes (3): instrument, metadata, outfit

## Knowledge Gaps
- **113 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+108 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `isProduction()` connect `Community 4` to `Community 0`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `CerebroOverview` connect `Community 1` to `Community 0`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Why does `buildOverview()` connect `Community 0` to `Community 8`, `Community 4`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _113 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.11304347826086956 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._