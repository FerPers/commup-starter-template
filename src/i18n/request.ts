import { getRequestConfig } from 'next-intl/server'
import { cookies, headers } from 'next/headers'

const SUPPORTED = ['es', 'en'] as const
type Locale = (typeof SUPPORTED)[number]

/**
 * Locale: cookie explícita (elección del usuario) > Accept-Language > 'en'.
 * El fallback es inglés: el mercado O&G internacional es anglófono y un
 * visitante con idioma no soportado (de, fr, pt…) lee mejor en en que es.
 */
function negotiate(acceptLanguage: string): Locale {
  // "es-CO,es;q=0.9,en;q=0.8" → primer idioma base soportado por orden de q
  const ranked = acceptLanguage
    .split(',')
    .map(part => {
      const [tag, ...params] = part.trim().split(';')
      const q = params.find(p => p.trim().startsWith('q='))
      return { base: tag.trim().toLowerCase().split('-')[0], q: q ? parseFloat(q.split('=')[1]) : 1 }
    })
    .filter(({ q }) => !Number.isNaN(q) && q > 0)
    .sort((a, b) => b.q - a.q)

  for (const { base } of ranked) {
    if ((SUPPORTED as readonly string[]).includes(base)) return base as Locale
  }
  return 'en'
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const raw = cookieStore.get('locale')?.value

  let locale: Locale
  if (raw === 'en' || raw === 'es') {
    locale = raw
  } else {
    const h = await headers()
    locale = negotiate(h.get('accept-language') ?? '')
  }

  const messages = locale === 'en'
    ? (await import('./messages/en.json')).default
    : (await import('./messages/es.json')).default

  return { locale, messages }
})
