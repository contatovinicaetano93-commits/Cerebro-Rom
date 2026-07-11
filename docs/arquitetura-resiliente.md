# Arquitetura — ver `mapa-kpis-avec.md`

Este arquivo aponta para o mapa único. Resumo operacional:

1. **fast** (cron ~5 min): agenda, atendidos, receita, cancel/no-show do dia.
2. **full** (manual / 1× dia): + clientes + B (semana) + C (comercial).
3. Cérebro só lê os dois Neons; falha parcial não derruba o painel.
