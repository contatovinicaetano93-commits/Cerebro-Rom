import { readFileSync } from 'fs'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]
}
// Smoke local — senha só para assinar tokens neste script
if (!process.env.CEREBRO_ADMIN_PASSWORD) {
  process.env.CEREBRO_ADMIN_PASSWORD = 'smoke-auth-harden-temp'
}

async function main() {
  const {
    createSessionToken,
    verifySessionToken,
    SESSION_TTL_SECONDS,
  } = await import('../src/lib/auth')
  const { checkLoginRateLimit } = await import('../src/lib/auth-rate-limit')

  const token = await createSessionToken()
  if (!(await verifySessionToken(token))) throw new Error('valid token rejected')
  if (await verifySessionToken('deadbeef')) throw new Error('legacy accepted')
  if (await verifySessionToken(await createSessionToken(-10))) {
    throw new Error('expired accepted')
  }
  console.log('session ok ttl=', SESSION_TTL_SECONDS, 'token_prefix=', token.slice(0, 12))

  const key = `smoke:${Date.now()}`
  for (let i = 0; i < 10; i++) {
    const r = await checkLoginRateLimit(key, 10, 60)
    if (!r.ok) throw new Error(`blocked early at ${i}`)
  }
  const blocked = await checkLoginRateLimit(key, 10, 60)
  if (blocked.ok) throw new Error('11th attempt should block')
  console.log('rate-limit ok')
  console.log('OK')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
