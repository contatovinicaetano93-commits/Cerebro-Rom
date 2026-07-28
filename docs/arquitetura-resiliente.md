# Arquitetura — ver `mapa-kpis-avec.md`

Este arquivo aponta para o mapa único. Resumo operacional:

1. **fast** (cron ~5 min, BR/IG defasados + webhook): agenda, atendidos, receita, cancel/no-show do dia.
2. **full** (webhook + cron ~30 min, defasado): + clientes + B (semana) + C (comercial).
3. Cérebro só lê os dois poolers Supabase (poll ~3 min + cache ~45s); falha parcial não derruba o painel.
