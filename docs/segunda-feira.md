# Segunda-feira — checklist (pré-token Avec)

**Objetivo:** webhooks configurados + pipeline Iguatemi testado antes de terça.

Abra o chat e diga: **`smoke segunda`** — o agente roda `npm run smoke:full` e valida webhooks.

---

## 1. Smoke test (5 min)

```bash
cd ~/cerebro-rom
npm run smoke:full
```

Esperado: tudo ✅, P1/P2/P3 ainda vazios (OK).

---

## 2. Webhooks Avec — Brasil

| Campo | Valor |
|-------|-------|
| URL | `https://rom-club.vercel.app/api/webhooks/avec` |
| Header | `x-avec-secret: <AVEC_WEBHOOK_SECRET>` |
| Vercel | projeto `rom-club` → env `AVEC_WEBHOOK_SECRET` |

Eventos: `appointment.*`, `service.completed`, `client.upsert`

Teste (com secret configurado):

```bash
curl -X POST https://rom-club.vercel.app/api/webhooks/avec \
  -H "Content-Type: application/json" \
  -H "x-avec-secret: SEU_SECRET" \
  -d '{"event":"appointment.created","client_id":"test-1","name":"Teste","service_name":"Corte","scheduled_at":"2026-07-14T14:00:00.000Z"}'
```

Esperado: `200` + `"realtime":true`

---

## 3. Webhooks Avec — Iguatemi

| Campo | Valor |
|-------|-------|
| URL | `https://rom-iguatemi.vercel.app/api/webhooks/avec` |
| Header | `x-avec-secret: <SECRET_IGUATEMI>` — **diferente do Brasil** |
| Vercel | projeto `rom-iguatemi` |

Mesmo teste curl com URL Iguatemi.

---

## 4. Iguatemi — primeiro sync (sem token ainda)

1. Abrir https://rom-iguatemi.vercel.app/admin
2. Avec → Testar conexão (vai falhar sem token — OK)
3. Se possível, confirmar que `avec_sync_runs` incrementa após tentativa

Hoje: **0 sync runs** no Neon Iguatemi — segunda validamos que o botão/cron funciona.

---

## 5. Variáveis Vercel (conferir antes de terça)

Cada projeto:

- [ ] `CRON_SECRET` (único por unidade)
- [ ] `AVEC_WEBHOOK_SECRET`
- [ ] `AVEC_UNIT_ID` (ID da loja no Avec)
- [ ] `AVEC_API_TOKEN` — **deixar vazio até terça**

---

## Terça (preview)

1. Colar `AVEC_API_TOKEN` (Brasil + Iguatemi)
2. Redeploy
3. Admin → sync **full** nas duas
4. `npm run smoke:full` → P1/P2/P3 > 0
5. Cérebro → badge Live + Semana/Comercial preenchidos
