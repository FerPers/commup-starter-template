import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://commup.app',
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: 'https://commup.app/guia',
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: 'https://commup.app/privacy',
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: 'https://commup.app/terms',
      changeFrequency: 'yearly',
      priority: 0.2,
    },
  ]
}
