import { defineConfig } from 'vitest/config'
import path from 'path'

// Testes que batem em http://localhost:3000. Exigem `npm run dev` rodando.
// Não entram no `npm test` nem no CI — ver vitest.config.ts.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    // Casos fazem `await import('@/lib/...')` dentro do próprio teste.
    // O custo de transformar o módulo entra no orçamento do caso, e 5s (padrão)
    // estoura em máquina carregada.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
