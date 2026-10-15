import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Sprint T (2026-09-03): pruebas unitarias de módulos puros + smoke de BD opcional (tests/db).
// Las de BD corren un archivo a la vez: en paralelo compiten por la misma BD de prueba y caen en
// statement timeouts (2026-10-15, con 11 archivos). Las unitarias siguen en paralelo.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    passWithNoTests: false,
    projects: [
      { extends: true, test: { name: 'unit', include: ['src/**/*.test.ts'] } },
      { extends: true, test: { name: 'db', include: ['tests/**/*.test.ts'], fileParallelism: false } },
    ],
  },
})
