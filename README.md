# Cérebro · Painel Waltter

Painel executivo para o **Waltter** conduzir **ROM Brasil** + **ROM Iguatemi** com KPIs de decisão — consolidado, comparativo e alertas.

## Fonte de dados

| Modo | Quando |
|------|--------|
| **Live** | `UNIT_BRASIL_DATABASE_URL` e/ou `UNIT_IGUATEMI_DATABASE_URL` no `.env.local` (`NEON_*` legado ainda lido) |
| **Mock** | Sem URLs, `CEREBRO_FORCE_MOCK=1`, ou falha total do live (fallback) |

Live lê os bancos das unidades via **postgres.js** (`ssl: require`, `prepare: false`):
- **Brasil** → Supabase pooler (`*.pooler.supabase.com:5432` session ou `:6543` tx). Env canônica: `UNIT_BRASIL_DATABASE_URL`; `NEON_BRASIL_*` é alias legado — valor **não** deve ser Neon.
- **Iguatemi** → Supabase pooler (mesmo padrão; `UNIT_IGUATEMI_DATABASE_URL` canônica; `NEON_IGUATEMI_*` legado).

Escritas do Cérebro:
- `cerebro_goals` em cada banco de unidade (metas no painel)
- `report_runs` / `report_unit_metrics` no Neon próprio (`CEREBRO_DATABASE_URL`) — snapshots sob demanda

```
ROM Brasil (Supabase pooler)     ──SELECT──┐
                                           ├──► GET /api/overview ──► Cérebro
ROM Iguatemi (Supabase pooler)   ─SELECT──┘
                                           ├──► PUT /api/goals → cerebro_goals (por unidade)
                                           └──► POST /api/reports → Neon Cérebro (snapshots)
```

## KPIs

| Bloco | Métricas |
|-------|----------|
| **Metas** | Meta diária + capacidade por unidade (editável no painel) |
| **Consolidado hoje** | Faturamento, meta do dia (quando definida), progresso |
| **MTD** | Receita acumulada do mês vs meta |
| **Operação** | Ocupação, comparecimento, taxa de no-show |
| **Financeiro Avec** | CMV (saídas 0044), CMV/receita, conciliação 0081 |
| **Estoque Avec** | Valor, alertas, SKUs zerados, drift vs 0045 |
| **Comparativo** | Scorecard Brasil × Iguatemi com Δ% |
| **Tendência** | Receita 30 dias Brasil vs Iguatemi |
| **Alertas** | Sync, no-show, metas, estoque, conciliação |
| **Relatórios** | Snapshot sob demanda + export CSV / XLSX |

## Setup

```bash
cp .env.example .env.local
# preencher UNIT_BRASIL_DATABASE_URL + UNIT_IGUATEMI_DATABASE_URL (ambos Supabase pooler)
# (NEON_* ainda funciona como legado)
# + CEREBRO_ADMIN_PASSWORD
# npm run check:brasil-db-host  # falha se BR/IG ainda apontarem para neon.tech
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) → redireciona para `/login`.

### Auth (Waltter)

| Variável | Padrão |
|----------|--------|
| `CEREBRO_ADMIN_USER` | `waltter` |
| `CEREBRO_ADMIN_PASSWORD` | *(obrigatório em produção; também assina a sessão)* |

Sessão: cookie `httpOnly` com token `v1.<exp>.<hmac>` (7 dias), HMAC = senha admin (Edge e Serverless compartilham a mesma chave). `CEREBRO_SESSION_SECRET` não é usado. Login: rate limit 10/15min por IP. `/api/health` exige login; `GET /api/health/public` é probe público mínimo (`{ ok, service, units_configured }`) para uptime.

Sem `CEREBRO_ADMIN_PASSWORD`, o auth fica desligado (só use em local de emergência).

### Deploy Vercel

1. `vercel login` (conta que já tem `rom-club` / `rom-iguatemi`)
2. `vercel --yes` neste repo
3. Em Environment Variables (Production): as mesmas do `.env.example`
4. Domínio opcional: `cerebro.rom.club` → Project → Domains

## Stack

Next.js (App Router) + TypeScript + Tailwind + Recharts + `postgres` (postgres.js).

## Pastas

- `src/lib/live/fetch-unit.ts` — leitura por unidade
- `src/lib/live/overview.ts` — consolidação + alertas
- `src/lib/mock-overview.ts` — fallback / demo
- `src/app/api/overview` — API
- `src/app/_components/Dashboard.tsx` — UI

## Nota sobre dados atuais

Unidades = Supabase pooler. Snapshots do Cérebro podem usar Neon próprio (`CEREBRO_DATABASE_URL`).
Sem token Avec na unidade, o painel mostra sync incompleto / base sem métricas — não inventa KPI.
Guia: [`docs/quando-token-avec.md`](docs/quando-token-avec.md).
