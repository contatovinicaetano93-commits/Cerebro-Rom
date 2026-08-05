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
| `UNIT_BRASIL_DATABASE_URL` | `*.pooler.supabase.com` (canônico) |
| `UNIT_IGUATEMI_DATABASE_URL` | idem |
| `NEON_BRASIL_DATABASE_URL` / `NEON_IGUATEMI_DATABASE_URL` | alias legado — mesmo pooler Supabase, **não** Neon |
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
| `contacts` | Não | Leads do dia — paridade Contatos Novos: `channel='avec'`, `avec_client_id` nulo, `status<>'importado'`, exclui dump (`avec_sync_clients%`, `avec_backfill%`, `avec_lake%`) |
| `stock_products` / `stock_movements` / `stock_alerts` | Não | CMV / valor / alertas |
| `avec_report_snapshots` | Não | Drift 0045 (`fetched_at`) |
| `cerebro_goals` | Criada pelo Cérebro | Metas (write) |
| `finance_expenses` | — | **Fora do Cérebro** (Omie só nas unidades) |

Unidade sem `salon_daily_metrics` → erro de schema / ilegível (não entra R$0 nos totais de rede).

## Janelas de sync (unidades → tabelas)

| Modo | O que preenche | Observação |
|------|----------------|------------|
| Avec **fast** | métricas dia (camada A); 0051 ontem→amanhã | Cron ~20 min (staggered BR/IG). Webhook → `scope=kpi` só |
| Avec **full** fatiado | ops = P1/P2/P3 · agenda = +21d (Contatos +7d) · catalog = 0004 | `/api/avec/sync/full/{ops,agenda,catalog}` — 2×/dia + retry horário |
| Estoque Avec | posição/alertas de estoque | Cron separado nos painéis das unidades (`/api/estoque/sync`), não faz parte de `/api/avec/sync?mode=full` |
| Omie sync | `finance_expenses` | Só painel financeiro da unidade |
| Revenue/analytics backfill | histórico `salon_daily_metrics` | Preciso para Relatórios asOf em 2025 |

Relatórios do Cérebro aceitam `asOf` desde **2025-01-01**, mas o fetch cobre MTD + ~30d da data. Dias sem backfill nas unidades → zeros honestos.

Em `asOf` histórico:
- **dia / MTD / tendência** = métricas até a data
- **P1–P3 (ranking/comercial/retorno)** = snapshot mais recente ≤ `asOf` (lookback 14–30d) — `asOfDay` no payload mostra o dia real do snapshot
- **estoque** = omitido (`available: false`) — posição live não rebobina
- label de sync da unidade deixa isso explícito

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
