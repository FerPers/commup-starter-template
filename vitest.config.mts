import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Sprint T (2026-09-03): pruebas unitarias de módulos puros + smoke de BD opcional (tests/db).
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    passWithNoTests: false,
  },
})
