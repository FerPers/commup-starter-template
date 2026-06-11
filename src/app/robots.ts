import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Todo lo autenticado/operativo fuera del índice
        disallow: [
          '/dashboard',
          '/admin',
          '/projects',
          '/control-tower',
          '/ops',
          '/inbox',
          '/scan',
          '/tag_360',
          '/kpis',
          '/preservation',
          '/punch-list',
          '/certificates',
          '/work-plans',
          '/setup',
          '/login',
          '/offline',
          '/api/',
        ],
      },
    ],
    sitemap: 'https://commup.app/sitemap.xml',
  }
}
