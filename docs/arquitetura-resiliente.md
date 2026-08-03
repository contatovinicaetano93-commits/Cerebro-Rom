# Arquitetura — ver `mapa-kpis-avec.md`

Este arquivo aponta para o mapa único. Resumo operacional (fonte: `vercel.json` nas unidades):

1. **fast** (cron ~20 min, defasado entre BR/IG): agenda **ontem→amanhã** (0051), atendidos, receita, cancel/no-show do dia. Webhook Avec dispara só `POST /api/avec/sync?mode=fast&scope=kpi` (caixa/KPI — **não** full).
2. **full fatiado** (`/api/avec/sync/full/{ops,agenda,catalog}`): 2×/dia (10h/22h) + retry horário. **agenda** traz janela +21d (Contatos Agendados +7d). **ops** = P1/P2/P3; **catalog** = 0004.
3. **estoque** — cron separado (`/api/estoque/sync`), fora do pipeline Avec fast/full.
4. Cérebro só lê os dois poolers Supabase (poll ~3 min + cache ~45s); falha parcial não derruba o painel.
