import { defineConfig, devices } from '@playwright/test'

// G-17 (2026-10-23): recorridos E2E de campo. Corren SOLO contra el Supabase local (`supabase start` + semilla
// supabase/seed/e2e.sql) y la app compilada con `next build` + `next start`: el lanzador `npm run e2e`
// (scripts/e2e/run.mjs) arma el entorno y se niega a seguir si la URL de Supabase no es local.
const PORT = Number(process.env.E2E_PORT ?? 3100)

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // Un solo ITR sembrado: los recorridos comparten datos, van en serie.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // El inspector trabaja en el teléfono: viewport y toque de móvil, en Chromium.
    { name: 'telefono', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
