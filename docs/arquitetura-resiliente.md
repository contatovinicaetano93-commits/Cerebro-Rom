# Arquitetura — ver `mapa-kpis-avec.md`

Este arquivo aponta para o mapa único. Resumo operacional:

1. **fast** (cron ~5 min + webhook): agenda, atendidos, receita, cancel/no-show do dia.
2. **full** (webhook após atendimento/cancel + cron ~10 min): + clientes + B (semana) + C (comercial).
3. Cérebro só lê os dois Neons; falha parcial não derruba o painel.
