# Cérebro ROM — mapa único

Fonte de verdade. UI: **Comando → Hoje → Semana → Comercial**.

```
Avec (por unidade)
  → ROM sync (fast = A · full = A+B+C)
  → Neon da unidade
  → Cérebro Promise.allSettled (read-only)
```

## Camadas

| Camada | Sync | IDs | UI |
|--------|------|-----|-----|
| **A · Hoje** | fast | 0051, 0002, 0052, revenue (+ 0004 no full) | Comando + Hoje |
| **B · Semana** | full | 0021, 0126, 0032, 0107, 0003, 0007, 0017, 0088 | Semana + tendência 30d |
| **C · Comercial** | full | 0056, 0061, 0104, 0001 | Comercial |

**Fora do Cérebro:** comissões, estoque, NF, **0081** (mix pagamento).

## Resiliência (sem gaps)

- Unidade offline → outra segue (`allSettled`); badge *Live parcial*.
- Outage total → `mode: degraded` (zeros + alerta), **nunca mock falso**.
- Tabela/KPI ausente → bloco vazio + CTA, página não quebra.
- Sync `partial` / atrasado → `stale` na UI.
- P1/P2/P3 isolados no sync full (falha de um não mata os outros).

## Neon

| Tabela | Camada |
|--------|--------|
| `salon_daily_metrics` | A |
| `salon_p1_daily` | B (equipe / serviços / aquisição / reativação) |
| `salon_p3_daily` | B (retorno / novos / curva) |
| `salon_p2_daily` | C |

## Token

Sem `AVEC_API_TOKEN` nas Vercels ROM, A fica fraco e B/C vazios. Ver `quando-token-avec.md`.
Checklist pré-terça: `pre-avec-terca.md`.
