import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import LegalPage, { type LegalSection } from '@/components/landing/LegalPage'

export const metadata: Metadata = {
  title: 'Terms of Service — CommUp',
  robots: { index: true, follow: true },
}

const ES: { title: string; updated: string; back: string; sections: LegalSection[] } = {
  title: 'Términos de Servicio',
  updated: 'Última actualización: 11 de junio de 2026',
  back: 'Volver a commup.app',
  sections: [
    {
      heading: '1. Objeto',
      body: [
        'Estos términos regulan el uso del sitio público commup.app. El uso de la plataforma CommUp por organizaciones clientes se rige por el acuerdo de servicio suscrito con cada una de ellas, que prevalece sobre estos términos en lo que respecta a la plataforma.',
      ],
    },
    {
      heading: '2. Uso del sitio',
      body: [
        'Puedes navegar el sitio y solicitar una demo libremente. No está permitido usar el sitio para enviar contenido ilícito, intentar acceder sin autorización a la plataforma o interferir con su funcionamiento (incluido el abuso automatizado de formularios).',
      ],
    },
    {
      heading: '3. Propiedad intelectual',
      body: [
        'La marca CommUp, el software, el diseño del sitio y sus contenidos son propiedad de CommUp o de sus licenciantes. No se concede ninguna licencia sobre ellos por el mero uso del sitio.',
      ],
    },
    {
      heading: '4. Contenido informativo',
      body: [
        'El contenido del sitio es informativo y puede cambiar sin previo aviso. Las características de producto descritas pueden evolucionar; las condiciones aplicables a cada cliente son las de su acuerdo de servicio.',
      ],
    },
    {
      heading: '5. Limitación de responsabilidad',
      body: [
        'En la medida permitida por la ley, CommUp no será responsable de daños indirectos derivados del uso del sitio público. Nada en estos términos limita la responsabilidad que no pueda limitarse legalmente.',
      ],
    },
    {
      heading: '6. Privacidad',
      body: [
        'El tratamiento de datos personales en este sitio se describe en nuestra Política de Privacidad (commup.app/privacy).',
      ],
    },
    {
      heading: '7. Cambios y contacto',
      body: [
        'Podemos actualizar estos términos publicando la versión revisada en esta página. Para cualquier consulta: contacto@commup.app.',
      ],
    },
  ],
}

const EN: typeof ES = {
  title: 'Terms of Service',
  updated: 'Last updated: June 11, 2026',
  back: 'Back to commup.app',
  sections: [
    {
      heading: '1. Scope',
      body: [
        'These terms govern the use of the public commup.app website. Use of the CommUp platform by client organizations is governed by the service agreement signed with each of them, which prevails over these terms with respect to the platform.',
      ],
    },
    {
      heading: '2. Use of the site',
      body: [
        'You may browse the site and request a demo freely. You may not use the site to submit unlawful content, attempt unauthorized access to the platform, or interfere with its operation (including automated form abuse).',
      ],
    },
    {
      heading: '3. Intellectual property',
      body: [
        'The CommUp brand, software, site design and contents are property of CommUp or its licensors. No license over them is granted by mere use of the site.',
      ],
    },
    {
      heading: '4. Informational content',
      body: [
        'Site content is informational and may change without notice. Product features described may evolve; the conditions applicable to each client are those of their service agreement.',
      ],
    },
    {
      heading: '5. Limitation of liability',
      body: [
        'To the extent permitted by law, CommUp shall not be liable for indirect damages arising from the use of the public site. Nothing in these terms limits liability that cannot legally be limited.',
      ],
    },
    {
      heading: '6. Privacy',
      body: [
        'The processing of personal data on this site is described in our Privacy Policy (commup.app/privacy).',
      ],
    },
    {
      heading: '7. Changes and contact',
      body: [
        'We may update these terms by publishing the revised version on this page. For any inquiry: contacto@commup.app.',
      ],
    },
  ],
}

export default async function TermsPage() {
  const locale = await getLocale()
  const c = locale === 'en' ? EN : ES
  return <LegalPage title={c.title} updated={c.updated} sections={c.sections} backLabel={c.back} />
}
