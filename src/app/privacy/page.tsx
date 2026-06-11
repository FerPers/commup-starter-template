import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import LegalPage, { type LegalSection } from '@/components/landing/LegalPage'

export const metadata: Metadata = {
  title: 'Privacy Policy — CommUp',
  robots: { index: true, follow: true },
}

const ES: { title: string; updated: string; back: string; sections: LegalSection[] } = {
  title: 'Política de Privacidad',
  updated: 'Última actualización: 11 de junio de 2026',
  back: 'Volver a commup.app',
  sections: [
    {
      heading: '1. Responsable',
      body: [
        'CommUp ("nosotros") opera el sitio commup.app y la plataforma SaaS de gestión de completion & commissioning del mismo nombre. Para cualquier cuestión de privacidad puedes escribirnos a contacto@commup.app.',
      ],
    },
    {
      heading: '2. Datos que recogemos en este sitio',
      body: [
        'Formulario de demo: nombre, empresa, email, tipo de proyecto y un mensaje opcional. Junto al envío guardamos un hash irreversible de tu dirección IP (solo para limitar abuso del formulario) y el user agent del navegador.',
        'Analítica: usamos Cloudflare Web Analytics, una herramienta sin cookies que no te identifica ni te rastrea entre sitios. No usamos cookies de marketing ni píxeles de terceros en el sitio público.',
      ],
    },
    {
      heading: '3. Para qué usamos esos datos',
      body: [
        'Exclusivamente para responder a tu solicitud de demo y mantener el contacto comercial que tú inicias. La base legal es tu consentimiento al enviar el formulario y nuestro interés legítimo en responderte.',
        'No vendemos ni cedemos tus datos a terceros con fines publicitarios.',
      ],
    },
    {
      heading: '4. Dónde se almacenan',
      body: [
        'Los datos del formulario se guardan en nuestra base de datos gestionada por Supabase. El sitio se sirve a través de Cloudflare. Ambos actúan como encargados de tratamiento con sus propias garantías de seguridad y cumplimiento.',
      ],
    },
    {
      heading: '5. Cuánto tiempo los conservamos',
      body: [
        'Los leads se conservan mientras dure la relación comercial potencial o hasta que solicites su supresión. Los hashes de IP usados para rate-limiting carecen de valor identificativo fuera de esa función.',
      ],
    },
    {
      heading: '6. Tus derechos',
      body: [
        'Puedes solicitar acceso, rectificación o supresión de tus datos en cualquier momento escribiendo a contacto@commup.app. Respondemos en un plazo máximo de 30 días.',
      ],
    },
    {
      heading: '7. Datos dentro de la plataforma',
      body: [
        'Los datos de proyectos, usuarios y documentos que las organizaciones clientes gestionan dentro de la plataforma CommUp se rigen por el acuerdo de servicio firmado con cada organización, que actúa como responsable de sus propios datos. Cada organización está aislada mediante seguridad a nivel de fila (RLS) en la base de datos.',
      ],
    },
    {
      heading: '8. Cambios a esta política',
      body: [
        'Si cambiamos esta política publicaremos la versión actualizada en esta página con su fecha de revisión.',
      ],
    },
  ],
}

const EN: typeof ES = {
  title: 'Privacy Policy',
  updated: 'Last updated: June 11, 2026',
  back: 'Back to commup.app',
  sections: [
    {
      heading: '1. Who we are',
      body: [
        'CommUp ("we") operates the commup.app website and the completion & commissioning management SaaS platform of the same name. For any privacy matter, write to contacto@commup.app.',
      ],
    },
    {
      heading: '2. Data we collect on this site',
      body: [
        'Demo form: name, company, email, project type and an optional message. Alongside the submission we store an irreversible hash of your IP address (only to rate-limit form abuse) and your browser user agent.',
        'Analytics: we use Cloudflare Web Analytics, a cookieless tool that does not identify you or track you across sites. We use no marketing cookies or third-party pixels on the public site.',
      ],
    },
    {
      heading: '3. How we use that data',
      body: [
        'Exclusively to respond to your demo request and maintain the commercial contact you initiate. The legal basis is your consent when submitting the form and our legitimate interest in replying.',
        'We do not sell or share your data with third parties for advertising purposes.',
      ],
    },
    {
      heading: '4. Where it is stored',
      body: [
        'Form data is stored in our database managed by Supabase. The site is served through Cloudflare. Both act as data processors with their own security and compliance guarantees.',
      ],
    },
    {
      heading: '5. How long we keep it',
      body: [
        'Leads are kept for as long as the potential commercial relationship lasts, or until you request deletion. IP hashes used for rate limiting have no identifying value outside that function.',
      ],
    },
    {
      heading: '6. Your rights',
      body: [
        'You can request access, rectification or deletion of your data at any time by writing to contacto@commup.app. We respond within 30 days.',
      ],
    },
    {
      heading: '7. Data inside the platform',
      body: [
        'Project, user and document data managed by client organizations inside the CommUp platform is governed by the service agreement signed with each organization, which acts as controller of its own data. Each organization is isolated through row-level security (RLS) in the database.',
      ],
    },
    {
      heading: '8. Changes to this policy',
      body: [
        'If we change this policy, we will publish the updated version on this page with its revision date.',
      ],
    },
  ],
}

export default async function PrivacyPage() {
  const locale = await getLocale()
  const c = locale === 'en' ? EN : ES
  return <LegalPage title={c.title} updated={c.updated} sections={c.sections} backLabel={c.back} />
}
