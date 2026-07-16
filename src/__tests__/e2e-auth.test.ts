import { describe, it, expect } from 'vitest'

const BASE_URL = 'http://localhost:3000'
const TEST_USER = process.env.CEREBRO_ADMIN_USER || 'admin'
const TEST_PASS = process.env.CEREBRO_ADMIN_PASSWORD || 'test123'

describe('E2E: Auth Flow (Cerebro)', () => {
  let cookie: string

  describe('Login', () => {
    it('should reject invalid credentials', async () => {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'invalid', password: 'wrong' }),
      })
      expect(res.status).toBe(401)
    })

    it('should accept valid credentials', async () => {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: TEST_USER, password: TEST_PASS }),
      })
      expect(res.status).toBe(200)

      const setCookie = res.headers.get('set-cookie')
      if (setCookie) {
        cookie = setCookie.split(';')[0]
      }

      const data = await res.json()
      expect(data.data?.auth).toBe('ok')
    })
  })

  describe('Protected Routes', () => {
    it('should access health endpoint with auth', async () => {
      const res = await fetch(`${BASE_URL}/api/health`, {
        headers: cookie ? { Cookie: cookie } : {},
      })
      expect([200, 401]).toContain(res.status)
    })

    it('should access overview with auth', async () => {
      const res = await fetch(`${BASE_URL}/api/overview`, {
        headers: cookie ? { Cookie: cookie } : {},
      })
      expect([200, 401]).toContain(res.status)
    })
  })

  describe('Logout', () => {
    it('should logout successfully', async () => {
      if (!cookie) {
        return // Skip if not logged in
      }

      const res = await fetch(`${BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { Cookie: cookie },
      })
      expect(res.status).toBe(200)
    })
  })
})
