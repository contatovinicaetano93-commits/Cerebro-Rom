# Quando o AVEC_API_TOKEN chegar

Sem o token **não dá** para puxar faturamento/atendidos reais da Avec.
O Cérebro já está live nos Neons; o gargalo é só a Avec.

## Checklist (cada unidade)

### ROM Brasil (`rom-club`)

1. Vercel → `rom-club` → Environment Variables → Production  
2. `AVEC_API_TOKEN` = token recebido (Authorization **sem** `Bearer`)  
3. Remover `AVEC_MOCK` se existir  
4. Redeploy  
5. Admin → Testar conexão → Rodar sync **full**  
6. Confirmar no Cérebro: badge Live + receita/atendidos saindo de zero

Cron fast (já previsto):  
`POST https://rom-club.vercel.app/api/avec/sync?mode=fast`  
Header: `Authorization: Bearer $CRON_SECRET`

### ROM Iguatemi (`rom-iguatemi`)

1. Mesmos passos no projeto Vercel do Iguatemi  
2. Token **próprio da unidade** (não reutilizar o do Brasil)  
3. Cron: `POST https://rom-iguatemi.vercel.app/api/avec/sync?mode=fast`

## O que já está pronto (sem token)

- Schema Neon com `salon_daily_metrics` + `avec_report_snapshots` nas duas unidades  
- Sync endurecido: falha de snapshot **não derruba** mais o job  
- Auto-create da tabela de snapshots se o delta não tiver rodado  
- Cérebro lendo os dois Neons e alertando “aguardando token” em vez de falso crítico eterno

## Teste opcional com mock (só local)

```bash
# no repo da unidade
AVEC_MOCK=1 npm run dev
# POST /api/avec/sync?mode=full com sessão admin ou CRON_SECRET
```

**Não** deixe `AVEC_MOCK=1` em Production depois que o token real existir.
