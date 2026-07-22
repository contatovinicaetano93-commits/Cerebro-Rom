import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  validateAdminCredentials,
  createSessionToken,
  verifySessionToken,
  isAuthorized,
  getAdminUser,
  getAdminPassword,
} from './auth'
import type { NextRequest } from 'next/server'

describe('Cerebro Auth', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.CEREBRO_ADMIN_USER = 'waltter'
    process.env.CEREBRO_ADMIN_PASSWORD = 'test-password-123'
    delete process.env.CEREBRO_SESSION_SECRET
    delete process.env.VERCEL_ENV
    process.env.NODE_ENV = 'test'
  })

  describe('validateAdminCredentials', () => {
    it('should accept valid credentials', () => {
      const result = validateAdminCredentials('waltter', 'test-password-123')
      expect(result).toBe(true)
    })

    it('should reject invalid username', () => {
      const result = validateAdminCredentials('invalid', 'test-password-123')
      expect(result).toBe(false)
    })

    it('should reject invalid password', () => {
      const result = validateAdminCredentials('waltter', 'wrong-password')
      expect(result).toBe(false)
    })

    it('should reject without password configured', () => {
      process.env.CEREBRO_ADMIN_PASSWORD = ''
      const result = validateAdminCredentials('waltter', '')
      expect(result).toBe(false)
    })

    it('should be timing-safe (trimmed inputs)', () => {
      const result = validateAdminCredentials('  waltter  ', 'test-password-123')
      expect(result).toBe(true)
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

    it('should return different token if password/secret changes', async () => {
      const token1 = await createSessionToken()
      process.env.CEREBRO_ADMIN_PASSWORD = 'different-password'
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

  describe('isAuthorized', () => {
    it('should allow dev mode without password', async () => {
      process.env.NODE_ENV = 'development'
      process.env.CEREBRO_ADMIN_PASSWORD = ''

      const req = {
        cookies: {
          get: () => undefined,
        },
      } as unknown as NextRequest

      const result = await isAuthorized(req)
      expect(result).toBe(true)
    })

    it('should block production without password', async () => {
      process.env.NODE_ENV = 'production'
      process.env.VERCEL_ENV = 'production'
      process.env.CEREBRO_ADMIN_PASSWORD = ''

      const req = {
        cookies: {
          get: () => undefined,
        },
      } as unknown as NextRequest

      const result = await isAuthorized(req)
      expect(result).toBe(false)
    })

    it('should reject invalid session cookie', async () => {
      const req = {
        cookies: {
          get: () => ({ value: 'invalid-token' }),
        },
      } as unknown as NextRequest

      const result = await isAuthorized(req)
      expect(result).toBe(false)
    })

    it('should accept valid session cookie', async () => {
      const token = await createSessionToken()
      const req = {
        cookies: {
          get: () => ({ value: token }),
        },
      } as unknown as NextRequest

      expect(await isAuthorized(req)).toBe(true)
    })
  })

  describe('credentials', () => {
    it('should read admin user from env', () => {
      expect(getAdminUser()).toBe('waltter')
    })

    it('should read admin password from env', () => {
      expect(getAdminPassword()).toBe('test-password-123')
    })

    it('should trim credentials', () => {
      process.env.CEREBRO_ADMIN_USER = '  padded-user  '
      process.env.CEREBRO_ADMIN_PASSWORD = '  padded-pass  '
      expect(getAdminUser()).toBe('padded-user')
      expect(getAdminPassword()).toBe('padded-pass')
    })
  })
})
