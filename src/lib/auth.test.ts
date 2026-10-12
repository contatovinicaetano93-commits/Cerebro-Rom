import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  validateAdminCredentials,
  createSessionToken,
  verifySessionToken,
  isAuthorized,
  requireSession,
  getAdminUser,
  getAdminPassword,
  getSessionSecret,
  mustEnforceAuth,
  useSecureCookies,
  AUTH_COOKIE,
} from './auth'
import type { NextRequest } from 'next/server'

function clearDbUrls() {
  delete process.env.UNIT_BRASIL_DATABASE_URL
  delete process.env.BRASIL_DATABASE_URL
  delete process.env.NEON_BRASIL_DATABASE_URL
  delete process.env.UNIT_IGUATEMI_DATABASE_URL
  delete process.env.IGUATEMI_DATABASE_URL
  delete process.env.NEON_IGUATEMI_DATABASE_URL
  delete process.env.CEREBRO_DATABASE_URL
}

describe('Cerebro Auth', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.CEREBRO_ADMIN_USER = 'waltter'
    process.env.CEREBRO_ADMIN_PASSWORD = 'test-password-123'
    process.env.CEREBRO_SESSION_SECRET = 'test-session-secret-high-entropy-32b'
    delete process.env.VERCEL_ENV
    delete process.env.VERCEL
    clearDbUrls()
    process.env.NODE_ENV = 'test'
  })

  describe('validateAdminCredentials', () => {
    it('should accept valid credentials', () => {
      expect(validateAdminCredentials('waltter', 'test-password-123')).toBe(true)
    })

    it('should reject invalid username', () => {
      expect(validateAdminCredentials('invalid', 'test-password-123')).toBe(false)
    })

    it('should reject invalid password', () => {
      expect(validateAdminCredentials('waltter', 'wrong-password')).toBe(false)
    })

    it('should reject without password configured', () => {
      process.env.CEREBRO_ADMIN_PASSWORD = ''
      expect(validateAdminCredentials('waltter', '')).toBe(false)
    })

    it('should reject without admin user configured', () => {
      process.env.CEREBRO_ADMIN_USER = ''
      expect(validateAdminCredentials('waltter', 'test-password-123')).toBe(false)
    })

    it('should be timing-safe (trimmed inputs)', () => {
      expect(validateAdminCredentials('  waltter  ', 'test-password-123')).toBe(true)
    })
  })

  describe('session secret', () => {
    it('signs only with CEREBRO_SESSION_SECRET, not admin password', async () => {
      expect(getSessionSecret()).toBe('test-session-secret-high-entropy-32b')
      const token = await createSessionToken()
      expect(await verifySessionToken(token)).toBe(true)

      process.env.CEREBRO_SESSION_SECRET = 'other-secret-value-xxxxxxxxxxxxxxxx'
      expect(await verifySessionToken(token)).toBe(false)
    })

    it('createSessionToken fails without session secret', async () => {
      delete process.env.CEREBRO_SESSION_SECRET
      await expect(createSessionToken()).rejects.toThrow(/CEREBRO_SESSION_SECRET/)
    })

    it('rejects tokens signed with admin password (fallback removed)', async () => {
      const enc = new TextEncoder()
      const password = getAdminPassword()
      const user = getAdminUser()
      const exp = Math.floor(Date.now() / 1000) + 3600
      const key = await crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      )
      const sig = await crypto.subtle.sign(
        'HMAC',
        key,
        enc.encode(`cerebro-session:v1:${user}:${exp}`),
      )
      const hex = Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
      expect(await verifySessionToken(`v1.${exp}.${hex}`)).toBe(false)
    })
  })

  describe('createSessionToken', () => {
    it('should create v1 token with exp claim', async () => {
      const token = await createSessionToken()
      expect(token.startsWith('v1.')).toBe(true)
      const parts = token.split('.')
      expect(parts).toHaveLength(3)
      expect(Number(parts[1])).toBeGreaterThan(Math.floor(Date.now() / 1000))
    })

    it('should return different token if session secret changes', async () => {
      const token1 = await createSessionToken()
      process.env.CEREBRO_SESSION_SECRET = 'different-session-secret-xxxxxxxxxx'
      const token2 = await createSessionToken()
      expect(token1).not.toBe(token2)
    })

    it('should verify valid token', async () => {
      const token = await createSessionToken()
      expect(await verifySessionToken(token)).toBe(true)
    })

    it('should reject expired token', async () => {
      const token = await createSessionToken(-5)
      expect(await verifySessionToken(token)).toBe(false)
    })

    it('should reject legacy hex token', async () => {
      expect(await verifySessionToken('abcdef0123456789')).toBe(false)
    })
  })

  describe('fail-closed', () => {
    it('allows local open mode without password when no DB URL', async () => {
      process.env.NODE_ENV = 'development'
      process.env.CEREBRO_ADMIN_PASSWORD = ''
      clearDbUrls()
      expect(mustEnforceAuth()).toBe(false)

      const req = {
        cookies: { get: () => undefined },
      } as unknown as NextRequest

      expect(await isAuthorized(req)).toBe(true)
    })

    it('blocks production without password', async () => {
      process.env.NODE_ENV = 'production'
      process.env.VERCEL_ENV = 'production'
      process.env.CEREBRO_ADMIN_PASSWORD = ''

      const req = {
        cookies: { get: () => undefined },
      } as unknown as NextRequest

      expect(await isAuthorized(req)).toBe(false)
    })

    it('blocks Vercel Preview without password', async () => {
      process.env.NODE_ENV = 'production'
      process.env.VERCEL_ENV = 'preview'
      process.env.CEREBRO_ADMIN_PASSWORD = ''
      expect(mustEnforceAuth()).toBe(true)

      const req = {
        cookies: { get: () => undefined },
      } as unknown as NextRequest

      expect(await isAuthorized(req)).toBe(false)
    })

    it('blocks when any DB URL is set even in development', async () => {
      process.env.NODE_ENV = 'development'
      process.env.CEREBRO_ADMIN_PASSWORD = ''
      process.env.UNIT_BRASIL_DATABASE_URL =
        'postgresql://u:p@ep-x.us-east-1.aws.neon.tech/db?sslmode=require'
      expect(mustEnforceAuth()).toBe(true)

      const req = {
        cookies: { get: () => undefined },
      } as unknown as NextRequest

      expect(await isAuthorized(req)).toBe(false)
    })

    it('blocks preview when session secret missing (password present)', async () => {
      process.env.VERCEL_ENV = 'preview'
      process.env.CEREBRO_ADMIN_PASSWORD = 'test-password-123'
      delete process.env.CEREBRO_SESSION_SECRET
      expect(mustEnforceAuth()).toBe(true)

      const req = {
        cookies: { get: () => undefined },
      } as unknown as NextRequest

      expect(await isAuthorized(req)).toBe(false)
    })

    it('blocks production when session secret missing', async () => {
      process.env.VERCEL_ENV = 'production'
      process.env.CEREBRO_ADMIN_PASSWORD = 'test-password-123'
      delete process.env.CEREBRO_SESSION_SECRET

      const req = {
        cookies: { get: () => undefined },
      } as unknown as NextRequest

      expect(await isAuthorized(req)).toBe(false)
    })
  })

  describe('isAuthorized / requireSession', () => {
    it('should reject invalid session cookie', async () => {
      const req = {
        cookies: { get: () => ({ value: 'invalid-token' }) },
      } as unknown as NextRequest
      expect(await isAuthorized(req)).toBe(false)
    })

    it('should accept valid session cookie', async () => {
      const token = await createSessionToken()
      const req = {
        cookies: { get: () => ({ value: token }) },
      } as unknown as NextRequest
      expect(await isAuthorized(req)).toBe(true)
    })

    it('requireSession returns 401 without cookie when auth enabled', async () => {
      const req = new Request('http://localhost/api/overview')
      const denied = await requireSession(req)
      expect(denied).not.toBeNull()
      expect(denied!.status).toBe(401)
    })

    it('requireSession returns null with valid cookie', async () => {
      const token = await createSessionToken()
      const req = new Request('http://localhost/api/overview', {
        headers: { cookie: `${AUTH_COOKIE}=${token}` },
      })
      expect(await requireSession(req)).toBeNull()
    })

    it('requireSession returns 503 on preview without auth config', async () => {
      process.env.VERCEL_ENV = 'preview'
      process.env.CEREBRO_ADMIN_PASSWORD = ''
      delete process.env.CEREBRO_SESSION_SECRET
      const req = new Request('http://localhost/api/overview')
      const denied = await requireSession(req)
      expect(denied).not.toBeNull()
      expect(denied!.status).toBe(503)
    })
  })

  describe('useSecureCookies', () => {
    it('is true on Vercel preview', () => {
      process.env.VERCEL_ENV = 'preview'
      expect(useSecureCookies()).toBe(true)
    })

    it('is true when VERCEL=1', () => {
      process.env.VERCEL = '1'
      expect(useSecureCookies()).toBe(true)
    })

    it('is false in plain local test', () => {
      expect(useSecureCookies()).toBe(false)
    })
  })

  describe('credentials', () => {
    it('should read admin user from env (no hardcoded default)', () => {
      expect(getAdminUser()).toBe('waltter')
      delete process.env.CEREBRO_ADMIN_USER
      expect(getAdminUser()).toBe('')
    })

    it('should read admin password from env', () => {
      expect(getAdminPassword()).toBe('test-password-123')
    })

    it('should trim credentials', () => {
      process.env.CEREBRO_ADMIN_USER = '  padded-user  '
      process.env.CEREBRO_ADMIN_PASSWORD = '  padded-pass  '
      process.env.CEREBRO_SESSION_SECRET = '  padded-secret  '
      expect(getAdminUser()).toBe('padded-user')
      expect(getAdminPassword()).toBe('padded-pass')
      expect(getSessionSecret()).toBe('padded-secret')
    })
  })
})
