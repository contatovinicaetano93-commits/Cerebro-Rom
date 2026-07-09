# P0 — KPIs de operação (Avec)

Pente fino: só o que muda decisão do Waltter **hoje**, com fonte Avec clara.
Sem puxar dezenas de relatórios.

## O que entra no Cérebro (P0)

| KPI | Fonte Avec / cálculo | Decisão |
|-----|----------------------|---------|
| **Vagas hoje** | Capacidade − agendados (`0051` → `client_services` / `salon_daily_metrics.appointments`) | Onde encaixar |
| **Vagas próximas 2h** | Agendados `now…+2h` vs capacidade estimada 2h | Encaixe imediato |
| **Cancelamentos** | Relatório **`0052`** → `salon_daily_metrics.cancelled` | Remarcar / lista de espera |
| **No-shows** | Já no sync (status falta / métrica) | Remarcar + confirmação |
| **Novos vs recorrentes** | `new_clients` / `returning_clients` (ROM a partir de contatos; Avec `0017` opcional depois) | Saúde da base |

## Relatórios Avec usados (mínimo)

| ID | Nome | Uso |
|----|------|-----|
| **0051** | Clientes com agendamentos | Agenda + vagas |
| **0052** | Agendamentos cancelados | Cancelamentos do dia |
| **0002** | Clientes atendidos | Comparecimento / ticket |
| **0004** | Lista de clientes | Catálogo (full sync) |

Faturamento continua via `AVEC_REPORT_REVENUE` (env) quando configurado.

## O que NÃO entra no P0 (de propósito)

| ID | Motivo |
|----|--------|
| 0038 | Gap agendado×realizado — redundante com 0051+0002+0052 |
| 0248 | Status de agendamento — detalhe operacional, não comando |
| 0017 | Novos no período — útil depois; hoje usamos contatos ROM |
| 0021 / 0126 / 0032… | Ranking profissional / serviços — **P1**, não poluir o dia |

## Sync (ROMs)

- `0052` é o **default** de cancelamentos (override: `AVEC_REPORT_CANCELLATIONS`)
- Snapshot falho não derruba o sync
- Cérebro só **lê** o Neon

## Env opcional (Vercel de cada ROM)

```
# Se a unidade usar outro ID, sobrescreva:
# AVEC_REPORT_CANCELLATIONS=0052
# AVEC_REPORT_REVENUE=<id do relatório de faturamento da unidade>
```

## UI

Aba recolhível **“P0 · Ação do dia”** (aberta por padrão) + alertas de vagas/cancelamentos.
