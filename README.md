# Cérebro · Painel Waltter

Painel executivo para o **Waltter** conduzir **ROM Brasil** + **ROM Iguatemi** com KPIs de decisão — consolidado, comparativo e alertas.

## Fonte de dados

| Modo | Quando |
|------|--------|
| **Live** | `NEON_BRASIL_DATABASE_URL` e/ou `NEON_IGUATEMI_DATABASE_URL` no `.env.local` |
| **Mock** | Sem URLs, `CEREBRO_FORCE_MOCK=1`, ou falha total do live (fallback) |

Live lê os bancos das unidades. **Brasil = Supabase (Postgres)**; **Iguatemi = Neon**.
Os env vars podem continuar `NEON_*` (nome histórico) — `NEON_BRASIL_DATABASE_URL` pode apontar para a URL do Supabase.

Escritas do Cérebro:
- `cerebro_goals` em cada banco de unidade (metas no painel)
- `report_runs` / `report_unit_metrics` no Postgres próprio do Cérebro (`CEREBRO_DATABASE_URL`) — snapshots sob demanda

```
ROM Brasil (Supabase)          ──SELECT──┐
                                         ├──► GET /api/overview ──► Cérebro
ROM Iguatemi (Neon)            ─SELECT───┘
                                         ├──► PUT /api/goals → cerebro_goals (por unidade)
                                         └──► POST /api/reports → Cérebro DB (snapshots)
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
# preencher NEON_*_DATABASE_URL + CEREBRO_ADMIN_PASSWORD
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) → redireciona para `/login`.

### Auth (Waltter)

| Variável | Padrão |
|----------|--------|
| `CEREBRO_ADMIN_USER` | `waltter` |
| `CEREBRO_ADMIN_PASSWORD` | *(obrigatório em produção)* |
| `CEREBRO_SESSION_SECRET` | opcional — secret da sessão (senão usa a senha) |

Sessão: cookie `httpOnly` com token `v1.<exp>.<hmac>` (7 dias). Login: rate limit 10/15min por IP (DB Cérebro). `/api/health` exige login.

Sem `CEREBRO_ADMIN_PASSWORD`, o auth fica desligado (só use em local de emergência).

### Deploy Vercel

1. `vercel login` (conta que já tem `rom-club` / `rom-iguatemi`)
2. `vercel --yes` neste repo
3. Em Environment Variables (Production): as mesmas do `.env.example`
4. Domínio opcional: `cerebro.rom.club` → Project → Domains

## Stack

Next.js (App Router) + TypeScript + Tailwind + Recharts + Postgres (`postgres.js` / Neon serverless conforme a URL).

## Pastas

- `src/lib/live/fetch-unit.ts` — leitura por unidade
- `src/lib/live/overview.ts` — consolidação + alertas
- `src/lib/mock-overview.ts` — fallback / demo
- `src/app/api/overview` — API
- `src/app/_components/Dashboard.tsx` — UI

## Nota sobre dados atuais

Enquanto o **AVEC_API_TOKEN** não chegar, o painel live mostra o que já existe nos bancos
(agenda/contatos) e alertas de “aguardando token”.  
Guia: [`docs/quando-token-avec.md`](docs/quando-token-avec.md).
