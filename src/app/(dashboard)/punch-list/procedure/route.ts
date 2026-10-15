import { getLocale, getTranslations } from 'next-intl/server'
import { getActiveMembership } from '@/lib/supabase/membership'
import { renderPunchProcedurePdf } from '@/lib/pdf/punch-procedure'
import { PUNCH_IMPACTS, STARTUP_DISPOSITIONS, type PunchImpact, type StartupDisposition } from '@/lib/punches/category-guide'

export const dynamic = 'force-dynamic'

/** PDF del procedimiento de levantamiento de pendientes de la org activa (fase 4, §10.8). */
export async function GET() {
  const ctx = await getActiveMembership()
  if (!ctx) return new Response('Unauthorized', { status: 401 })

  const [{ data: org }, { data: disciplines }, locale, t] = await Promise.all([
    ctx.supabase.from('organizations').select('name').eq('id', ctx.orgId).single(),
    ctx.supabase.from('disciplines').select('code, name').eq('org_id', ctx.orgId).order('code'),
    getLocale(),
    getTranslations('PunchGuide'),
  ])
  const lang = locale === 'en' ? 'en' : 'es'

  const bytes = await renderPunchProcedurePdf({
    orgName: org?.name ?? 'CommUp',
    lang,
    impactLabel: Object.fromEntries(PUNCH_IMPACTS.map(i => [i, t(`impact.${i}`)])) as Record<PunchImpact, string>,
    dispositionLabel: Object.fromEntries(STARTUP_DISPOSITIONS.map(d => [d, t(`disposition.${d}`)])) as Record<StartupDisposition, string>,
    disciplines: disciplines ?? [],
  })
  const name = lang === 'en' ? 'punch-procedure' : 'procedimiento-punch'
  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="CommUp-${name}.pdf"`,
      'Cache-Control': 'private, no-cache',
    },
  })
}
