# Cérebro ROM — mapa único

Fonte de verdade. UI: **Comando → Metas → Comparativo → Hoje → Semana → Comercial**.

```
Avec (por unidade)
  → ROM sync (fast = A · full = A+B+C + estoque)
  → Neon da unidade
  → Cérebro Promise.allSettled (read-only KPIs)
    · escrita: cerebro_goals (metas nas unidades)
    · escrita: report_runs no Neon Cérebro (snapshots sob demanda)
```

## Camadas

| Camada | Sync | IDs | UI |
|--------|------|-----|-----|
| **A · Hoje** | fast | 0051, 0002, 0052, revenue (+ 0004 no full) | Comando + Hoje |
| **B · Semana** | full | 0021, 0126, 0032, 0107, 0003, 0007, 0017, 0088 | Semana + tendência 30d |
| **C · Comercial** | full | 0056, 0061, 0104, 0001 | Comercial |
| **D · Financeiro Avec** | full | 0081 (mix) + 0044 (CMV saídas) | Comparativo + comando CMV |
| **E · Estoque Avec** | stock | 0149 / alertas / 0045 (drift) | Comparativo + alertas |

Comparativo inclui também **receita perdida** (cancel + no-show × ticket) e **conciliação 0081** (totais, gap, status, forma #1).

**Fora do Cérebro (de propósito):** despesas manuais, comissões, NF, fila de compra detalhada.

## Metas

- Preenchidas no painel (`PUT /api/goals`) → tabela `cerebro_goals` em cada Neon.
- Sem meta salva: progresso fica vazio (sem fallback inventado de R$ 5.000).
- Env `BRASIL_DAILY_GOAL` / `IGUATEMI_DAILY_*` só como bootstrap opcional.

## Comparativo

Scorecard **Brasil | Iguatemi | Δ%** por grupo: ops · comercial · financeiro Avec · estoque Avec.

## Resiliência (sem gaps)

- Unidade offline → outra segue (`allSettled`); badge *Live parcial*.
- Outage total → `mode: degraded` (zeros + alerta), **nunca mock falso**.
- Tabela/KPI ausente → bloco vazio / `null` no scorecard, página não quebra.
- Sync `partial` / atrasado → `stale` na UI.

## Neon

| Tabela | Camada |
|--------|--------|
| `salon_daily_metrics` | A |
| `salon_p1_daily` | B |
| `salon_p3_daily` | B |
| `salon_p2_daily` | C + mix 0081 |
| `stock_movements` / `stock_products` / `stock_alerts` | D/E |
| `avec_report_snapshots` (0045) | drift estoque |
| `cerebro_goals` | metas (write) |

## Neon Cérebro (`CEREBRO_DATABASE_URL`)

Snapshots sob demanda do overview (KPIs do painel). Export CSV/XLSX.

| Tabela | Uso |
|--------|-----|
| `report_runs` | captura + payload JSONB completo |
| `report_unit_metrics` | métricas flat por unidade (consulta/histórico) |

APIs: `GET/POST /api/reports`, `GET /api/reports/[id]?format=csv|xlsx`.

## Token

Sem `AVEC_API_TOKEN` nas Vercels ROM, A fica fraco e B–E vazios. Ver `quando-token-avec.md`.
