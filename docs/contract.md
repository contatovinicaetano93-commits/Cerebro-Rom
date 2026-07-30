# Contrato de dados: Cérebro ↔ unidades (BR / IG)

Fonte de verdade do que o Cérebro **lê** nos bancos Supabase das unidades e do que as unidades **devem sincronizar**. Não substitui `docs/mapa-kpis-avec.md` (mapa de UI); este arquivo é o contrato de schema/KPI.

Versão: 2026-07-30

## Papéis

| Sistema | Papel |
|---------|--------|
| **ROM Brasil** / **ROM Iguatemi** | Sync Avec (+ Omie despesas) → tabelas locais. Painel ops + gerência 0011/0021. |
| **Cérebro** | Read-only nas unidades (pooler Supabase). Escreve só `cerebro_goals`. Snapshots em Neon próprio. |

Cérebro **nunca** chama Avec/Omie HTTP. Painéis das unidades: `https://rom-club.vercel.app` · `https://rom-iguatemi.vercel.app`.

## Variáveis de conexão (Cérebro)

| Env | Host esperado |
|-----|----------------|
| `NEON_BRASIL_DATABASE_URL` | `*.pooler.supabase.com` (nome legado — **não** Neon) |
| `NEON_IGUATEMI_DATABASE_URL` | idem |
| `CEREBRO_DATABASE_URL` | Neon do Cérebro (report_runs) |

Host `.neon.tech` nas envs de unidade → tratado como offline (sem KPI falso).

## Tabelas obrigatórias / opcionais

| Tabela | Obrigatória? | Uso no Cérebro |
|--------|--------------|----------------|
| `salon_daily_metrics` | **Sim** | Hoje, MTD, last30, ticket |
| `salon_p1_daily` | Não | Ranking profissionais / serviços / aquisição |
| `salon_p2_daily` | Não | Comercial + `payment_mix` (0081) |
| `salon_p3_daily` | Não | Taxa de retorno |
| `avec_sync_runs` | Não | Badge de sync |
| `client_services` | Não | Vagas 2h / agenda |
| `contacts` | Não | Leads do dia (exclui `avec_%`, `importado`) |
| `stock_products` / `stock_movements` / `stock_alerts` | Não | CMV / valor / alertas |
| `avec_report_snapshots` | Não | Drift 0045 (`fetched_at`) |
| `cerebro_goals` | Criada pelo Cérebro | Metas (write) |
| `finance_expenses` | — | **Fora do Cérebro** (Omie só nas unidades) |

Unidade sem `salon_daily_metrics` → erro de schema / ilegível (não entra R$0 nos totais de rede).

## Janelas de sync (unidades → tabelas)

| Modo | O que preenche | Observação |
|------|----------------|------------|
| Avec **fast** | métricas dia (camada A) | Cron ~20 min |
| Avec **full** | A + P1/P2/P3 + estoque | 2×/dia |
| Omie sync | `finance_expenses` | Só painel financeiro da unidade |
| Revenue/analytics backfill | histórico `salon_daily_metrics` | Preciso para Relatórios asOf em 2025 |

Relatórios do Cérebro aceitam `asOf` desde **2025-01-01**, mas o fetch cobre MTD + ~30d da data. Dias sem backfill nas unidades → zeros honestos.

## Colunas / shapes frágeis

Não renomear sem atualizar `src/lib/live/fetch-unit.ts`, `parse-kpi-layers.ts`, `fetch-money-stock.ts`:

- `salon_daily_metrics.day` (date), `revenue`, `attended`, `ticket_avg`, …
- P2 `payment_mix`: `{ method, amount }[]`
- P1 `professionals`: lista com `name` + receita
- Snapshots 0045: coluna **`fetched_at`** (não `created_at`)
- Stock: `unit_cost` / `avg_cost`, movimentos `type='saida'`

## Gerência (fora do contrato de leitura)

| Unidade | UI | API |
|---------|----|-----|
| BR / IG | `/admin/relatorio-diretoria` | `/api/director-report` |

Live Avec 0011/0021 no painel da unidade. Cérebro só **linka** (`unitGerenciaUrl`) — não replica o relatório.

## Checklist ao mudar schema na unidade

1. Atualizar `db/migrations.json` + delta SQL (BR e IG).
2. Se a coluna é lida pelo Cérebro → atualizar `fetch-*.ts` **e este contrato**.
3. Deploy unidade → boot migrations → validar `/api/overview` no Cérebro (sem `degraded` inesperado).
4. Se for histórico antigo → rodar backfill de revenue/analytics na unidade.

## Referências

- `docs/mapa-kpis-avec.md` — mapa UI × IDs Avec
- Unidades: `db/migrations.json`, `src/lib/avec/sync.ts`
- Cérebro: `src/lib/live/*`, `src/lib/unit-config.ts`
