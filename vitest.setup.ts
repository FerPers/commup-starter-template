import { vi } from 'vitest'
import { createTranslator } from 'next-intl'
import es from './src/i18n/messages/es.json'

// V3: las acciones traducen sus errores con getTranslations (request de Next). En las pruebas unitarias no hay
// request: se traduce con es.json, así las aserciones siguen viendo el texto que ve el usuario.
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace?: string | { namespace?: string }) =>
    createTranslator({ locale: 'es', messages: es, namespace: typeof namespace === 'string' ? namespace : namespace?.namespace } as Parameters<typeof createTranslator>[0]),
}))
