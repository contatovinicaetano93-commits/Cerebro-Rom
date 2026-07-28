# Vercel — Cérebro: Brasil + Iguatemi → Supabase

`NEON_BRASIL_DATABASE_URL` e `NEON_IGUATEMI_DATABASE_URL` devem apontar para **Supabase pooler**, não Neon (`*.neon.tech`).
Nomes das envs são legado; valores são Supabase.

## Production checklist

1. Vercel → cerebro-rom → Env → Production → `NEON_BRASIL_DATABASE_URL`
   - Host: `aws-*-pooler.supabase.com`
   - Port: `5432` (session) ou `6543` (transaction)
   - `sslmode=require`
2. Idem `NEON_IGUATEMI_DATABASE_URL` → pooler Supabase Iguatemi (`ggikztpsfmtpebfyuqah` / `aws-0-us-east-2.pooler.supabase.com`)
3. Leave `CEREBRO_DATABASE_URL` / project `DATABASE_URL` on Cérebro’s own Neon (snapshots)
4. `npm run check:brasil-db-host` com as duas URLs exportadas localmente
5. Optional: remove unused Neon-era `DATABASE_URL_UNPOOLED` only if unused (Cérebro app reads `NEON_*` + `CEREBRO_DATABASE_URL`)

Sensitive Production values cannot be decrypted via API — confirm in Vercel UI.
