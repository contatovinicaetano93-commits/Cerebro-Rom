# Preparação até terça (token Avec)

Checklist único — **sábado → segunda** deixa tudo pronto; **terça** é só colar token e validar.

## O que já funciona sem token

| Sistema | Sem Avec | Comportamento |
|---------|----------|---------------|
| ROM Brasil / Iguatemi | ✅ | Agenda/contatos via WhatsApp/Telegram; sync Avec aguarda token |
| Cérebro | ✅ | Live parcial (Neon); Camada A fraca; B/C vazios até full sync |
| Webhooks + cron | ✅ | Infra pronta; dispara sync quando token existir |

## Sábado — código e deploy

- [x] Push `cerebro-rom` (leitura P1/P2/P3 + merge #10–14)
- [x] Push `ROM` + `ROM-IGUATEMI` (sync realtime webhook + cron full 10 min)
- [ ] Confirmar deploys: cerebro-rom.vercel.app, rom-club, rom-iguatemi
- [ ] Login Waltter no Cérebro OK
- [ ] Smoke test: `npm run smoke` e `npm run smoke:full` no cerebro-rom

### Verificação Neon (11/07)

| | Brasil (rom-club) | Iguatemi |
|--|-------------------|----------|
| Tabelas P1/P2/P3 | ✅ existem | ✅ existem |
| salon_daily_metrics | 4 linhas | 4 linhas |
| salon_p1/p2/p3 | 0 (OK sem token) | 0 (OK sem token) |
| avec_sync_runs | 3 | 0 |
| HTTP health prod | 200 | 200 |

## Domingo — banco e simulação

- [ ] Neon Brasil: `schema.sql` + `db/delta-p1-kpis.sql`, `delta-p2-kpis.sql`, `delta-p3-kpis.sql`
- [ ] Neon Iguatemi: mesmos deltas (banco **separado**)
- [ ] Local com mock (opcional): `AVEC_MOCK=1` → POST `/api/avec/sync?mode=full` → conferir Cérebro Semana/Comercial

```bash
# no repo da unidade, com Neon configurado
AVEC_MOCK=1 npm run dev
# Admin → Rodar sync full
# Cérebro local: NEON_*_DATABASE_URL apontando pro mesmo Neon
```

## Segunda — webhooks (antes do token)

**Checklist detalhado:** [`segunda-feira.md`](segunda-feira.md)

No chat: diga **`smoke segunda`** para o agente rodar validação automática.

Conferir readiness (admin logado):

- ROM Brasil: `GET /api/health` → `readiness.cron_ready`, `webhook_ready`, `avec.kpi_layers`
- ROM Iguatemi: idem — hoje `last_full` provavelmente null
- Cérebro: `GET /api/health` → unidades Neon conectadas

| Unidade | URL webhook | Header |
|---------|-------------|--------|
| Brasil | `https://rom-club.vercel.app/api/webhooks/avec` | `x-avec-secret: $AVEC_WEBHOOK_SECRET` |
| Iguatemi | `https://rom-iguatemi.vercel.app/api/webhooks/avec` | idem (secret **próprio**) |

Variáveis já devem estar na Vercel **antes** de terça:

- `AVEC_API_TOKEN` — vazio até terça
- `AVEC_WEBHOOK_SECRET` — pode preencher agora
- `CRON_SECRET` — único por projeto Vercel
- `AVEC_UNIT_ID` — ID da loja no painel Avec

## Terça — go-live Avec (30 min por unidade)

### ROM Brasil

1. Vercel → `rom-club` → `AVEC_API_TOKEN` = token recebido
2. Remover `AVEC_MOCK` se existir
3. Redeploy
4. Admin → Testar conexão → Rodar sync **full**
5. Confirmar `salon_daily_metrics` + `salon_p1/p2/p3_daily` com dados

### ROM Iguatemi

1. Mesmos passos — token **da loja Iguatemi**, não reutilizar Brasil
2. Redeploy
3. Sync full

### Cérebro

1. Já lê os dois Neons — só validar badge **Live** + KPIs > 0
2. Comparativo Brasil vs Iguatemi preenchido
3. Seções Semana e Comercial com dados após full sync

## Cron automático (pós-terça)

| Job | Intervalo | Modo |
|-----|-----------|------|
| `/api/avec/sync` | 5 min | fast (Camada A) |
| `/api/avec/sync?mode=full` | 10 min | full (P1/P2/P3) |
| Webhook atendimento/cancel | tempo real | fast + full (debounce 2 min) |

## Rollback

Se token falhar terça: sistema continua operando (WhatsApp, contatos, Cérebro degradado). Não ativar mock em produção.
