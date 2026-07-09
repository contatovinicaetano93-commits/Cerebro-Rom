# Cérebro · Painel Waltter

Painel executivo para o **Waltter** conduzir **ROM Brasil** + **ROM Iguatemi** com KPIs de decisão — consolidado, comparativo e alertas.

## Fonte de dados

| Modo | Quando |
|------|--------|
| **Live** | `NEON_BRASIL_DATABASE_URL` e/ou `NEON_IGUATEMI_DATABASE_URL` no `.env.local` |
| **Mock** | Sem URLs, `CEREBRO_FORCE_MOCK=1`, ou falha total do live (fallback) |

Live é **somente leitura** nos Neons dos apps operacionais. Não mistura bancos nem escreve neles.

```
ROM Brasil (Neon rom-club)     ──SELECT──┐
                                         ├──► GET /api/overview ──► Cérebro
ROM Iguatemi (Neon ROM-IGUATEMI) ─SELECT─┘
```

## KPIs

| Bloco | Métricas |
|-------|----------|
| **Consolidado hoje** | Faturamento, meta do dia, progresso |
| **MTD** | Receita acumulada do mês vs meta (meta = daily × dia do mês) |
| **Operação** | Ocupação, comparecimento, taxa de no-show |
| **Qualidade** | Ticket médio, receita em risco, novos clientes, conversão |
| **Por unidade** | Mesmos KPIs + top profissionais + status sync Avec |
| **Tendência** | Receita 30 dias Brasil vs Iguatemi |
| **Alertas** | Sync erro/atrasado, no-show, dados financeiros fracos |

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

Sem `CEREBRO_ADMIN_PASSWORD`, o auth fica desligado (só use em local de emergência).

### Deploy Vercel

1. `vercel login` (conta que já tem `rom-club` / `rom-iguatemi`)
2. `vercel --yes` neste repo
3. Em Environment Variables (Production): as mesmas do `.env.example`
4. Domínio opcional: `cerebro.rom.club` → Project → Domains

## Stack

Next.js (App Router) + TypeScript + Tailwind + Recharts + `@neondatabase/serverless`.

## Pastas

- `src/lib/live/fetch-unit.ts` — leitura por unidade
- `src/lib/live/overview.ts` — consolidação + alertas
- `src/lib/mock-overview.ts` — fallback / demo
- `src/app/api/overview` — API
- `src/app/_components/Dashboard.tsx` — UI

## Nota sobre dados atuais

Enquanto o **AVEC_API_TOKEN** não chegar, o painel live mostra o que já existe no Neon
(agenda/contatos) e alertas de “aguardando token”.  
Guia: [`docs/quando-token-avec.md`](docs/quando-token-avec.md).
