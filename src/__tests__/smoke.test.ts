import { describe, it, expect } from 'vitest'

describe('Smoke Tests', () => {
  describe('Health Check', () => {
    it('should reject unauthenticated health', async () => {
      const res = await fetch('http://localhost:3000/api/health', {
        headers: { Accept: 'application/json' },
      })
      expect(res.status).toBe(401)
    })
  })

  describe('Environment', () => {
    it('should have required env vars configured', () => {
      const brasilUrl =
        process.env.UNIT_BRASIL_DATABASE_URL ?? process.env.NEON_BRASIL_DATABASE_URL
      const iguatemiUrl =
        process.env.UNIT_IGUATEMI_DATABASE_URL ?? process.env.NEON_IGUATEMI_DATABASE_URL
      expect(brasilUrl).toBeDefined()
      expect(iguatemiUrl).toBeDefined()
    })

    it('should load without errors', async () => {
      const health = await import('@/lib/health')
      expect(health.getHealthStatus).toBeDefined()
      expect(health.getPublicHealthStatus).toBeDefined()
    })
  })

  describe('Build Artifacts', () => {
    it('should have compiled successfully', async () => {
      // '@' aponta para ./src — o package.json fica na raiz do repo.
      const pkg = await import('../../package.json')
      expect(pkg.name).toBeDefined()
      expect(pkg.version).toBeDefined()
    })
  })
})
