# Vercel — Cérebro: Brasil → Supabase

`NEON_BRASIL_DATABASE_URL` must point at **Supabase pooler**, not dead Neon BR (`ep-long-sun-*.neon.tech`).
Var name is legacy; value is Supabase. Iguatemi stays Neon.

## Production checklist

1. Vercel → cerebro-rom → Env → Production → `NEON_BRASIL_DATABASE_URL`
   - Host: `aws-*-pooler.supabase.com`
   - Port: `5432` (session) or `6543` (transaction)
   - `sslmode=require`
2. Confirm `NEON_IGUATEMI_DATABASE_URL` still Neon Iguatemi (`ep-round-glitter-…`)
3. Leave `CEREBRO_DATABASE_URL` / project `DATABASE_URL` on Cérebro’s own Neon
4. `npm run check:brasil-db-host` with the BR URL exported locally
5. Optional: remove unused Neon-era `DATABASE_URL_UNPOOLED` only if unused (Cérebro app reads `NEON_*` + `CEREBRO_DATABASE_URL`)

Sensitive Production values cannot be decrypted via API — confirm in Vercel UI.
