import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  validateAdminCredentials,
  createSessionToken,
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
    it('should create deterministic token', async () => {
      const token1 = await createSessionToken()
      const token2 = await createSessionToken()
      expect(token1).toBe(token2)
    })

    it('should return different token if password changes', async () => {
      const token1 = await createSessionToken()
      process.env.CEREBRO_ADMIN_PASSWORD = 'different-password'
      const token2 = await createSessionToken()
      expect(token1).not.toBe(token2)
    })

    it('should return string token', async () => {
      const token = await createSessionToken()
      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThan(0)
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
