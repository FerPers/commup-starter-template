import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { getActiveMembership } from '@/lib/supabase/membership'
import { parseSkylineParams, shiftFrom, skylineQuery, type SkylineBox, type SkylineParams, type SkylineTone } from '@/lib/readiness/skyline'
import { loadSkyline } from '@/lib/readiness/skyline-server'
import PlanningHub from '../PlanningHub'

// E1 (maquetas M, 2026-10-22): skyline de liberación. Una caja por sistema en la fecha comprometida (o pronosticada)
// de la liberación elegida, con color por avance de esa liberación. Todo en la URL (?gate=&scale=&from=).
export default async function SkylinePage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const { id } = await params
  const p = parseSkylineParams(await searchParams)
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()

  const [{ gates: gateList, gate, view, sky, today }, t, locale] = await Promise.all([
    loadSkyline(supabase, id, p),
    getTranslations('Planning'),
    getLocale(),
  ])
  const gateId = gate?.gateId

  const base = `/projects/${id}/planning/skyline`
  const href = (over: Partial<SkylineParams>) => `${base}${skylineQuery({ ...view, ...over })}`
  const fmt = new Intl.DateTimeFormat(locale, p.scale === 'week'
    ? { day: 'numeric', month: 'short', timeZone: 'UTC' }
    : { month: 'short', year: 'numeric', timeZone: 'UTC' })
  const label = (iso: string) => fmt.format(new Date(`${iso}T00:00:00Z`))
  const first = sky.columns[0]
  const last = sky.columns[sky.columns.length - 1]
  const boxHref = (b: SkylineBox) => `/projects/${id}/systems/${b.systemId}?tab=plan&gate=${gateId}`

  const segBtn = (on: boolean): React.CSSProperties => ({
    minHeight: 36, minWidth: 48, padding: '0 12px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 'var(--text-sm)', fontWeight: 600, textDecoration: 'none',
    background: on ? 'var(--card-bg)' : 'transparent', color: on ? 'var(--text-strong)' : 'var(--text-muted)',
    boxShadow: on ? '0 1px 2px rgba(0,0,0,.12)' : 'none',
  })
  const group: React.CSSProperties = { display: 'inline-flex', padding: 2, borderRadius: 8, background: 'var(--gray-100)', flexWrap: 'wrap' }
  const navBtn: React.CSSProperties = {
    minHeight: 36, minWidth: 36, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 8, display: 'inline-flex',
    alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: 'var(--text-strong)', fontSize: 'var(--text-sm)',
  }

  return (
    <div style={{ padding: 'clamp(12px, 4vw, 32px)', maxWidth: 1400, margin: '0 auto' }}>
      <PlanningHub projectId={project.id} current="skyline" />

      {gateList.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>{t('skyline.noGates')}</p>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-muted)' }}>{t('skyline.gate')}</span>
            <nav aria-label={t('skyline.gate')} style={group}>
              {gateList.map(g => (
                <Link key={g.gateId} href={href({ gate: g.gateId })} title={g.name} aria-current={g.gateId === gateId ? 'true' : undefined} style={segBtn(g.gateId === gateId)}>{g.code}</Link>
              ))}
            </nav>
            <nav aria-label={t('skyline.scale')} style={group}>
              {(['week', 'month'] as const).map(s => (
                <Link key={s} href={href({ scale: s, from: undefined })} aria-current={s === p.scale ? 'true' : undefined} style={segBtn(s === p.scale)}>{t(`skyline.scale_${s}`)}</Link>
              ))}
            </nav>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Link href={href({ from: shiftFrom(today, p.scale, p.from, -1) })} aria-label={t('skyline.prev')} style={navBtn}>‹</Link>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', minWidth: 150, textAlign: 'center' }}>{label(first.start)} – {label(last.end)}</span>
              <Link href={href({ from: shiftFrom(today, p.scale, p.from, 1) })} aria-label={t('skyline.next')} style={navBtn}>›</Link>
              {p.from && <Link href={href({ from: undefined })} style={{ ...navBtn, fontWeight: 600 }}>{t('skyline.today')}</Link>}
            </span>
            <span style={{ flex: 1 }} />
            <a href={`${base}/export${skylineQuery(view)}`} style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{t('skyline.excel')}</a>
          </div>

          <Legend t={t} />

          {gate && (
            <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-strong)', margin: '14px 0 8px' }}>
              {t('skyline.heading', { gate: gate.code, name: gate.name })}
            </h2>
          )}

          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--card-bg)' }}>
            <div style={{ minWidth: p.scale === 'week' ? 960 : 640, padding: '12px 12px 0' }}>
              {(sky.before.length > 0 || sky.after.length > 0) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 8 }}>
                  <span>{sky.before.length > 0 && <Link href={href({ from: shiftFrom(today, p.scale, p.from, -1) })}>{t('skyline.before', { count: sky.before.length })}</Link>}</span>
                  <span>{sky.after.length > 0 && <Link href={href({ from: shiftFrom(today, p.scale, p.from, 1) })}>{t('skyline.after', { count: sky.after.length })}</Link>}</span>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sky.columns.length}, minmax(0, 1fr))`, gap: 6, alignItems: 'end', minHeight: 260 }}>
                {sky.stacks.map((stack, i) => (
                  <div key={sky.columns[i].start} style={{
                    display: 'flex', flexDirection: 'column-reverse', gap: 6, height: '100%', justifyContent: 'flex-start', paddingBottom: 4,
                    background: sky.columns[i].isCurrent ? 'var(--primary-50)' : undefined, borderRadius: '6px 6px 0 0',
                  }}>
                    {stack.map(b => <Box key={b.systemId} b={b} href={boxHref(b)} t={t} />)}
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sky.columns.length}, minmax(0, 1fr))`, gap: 6, borderTop: '1px solid var(--border)', marginTop: 6 }}>
                {sky.columns.map(c => (
                  <div key={c.start} aria-current={c.isCurrent ? 'date' : undefined} style={{
                    padding: '6px 0 10px', textAlign: 'center', fontSize: 'var(--text-xs)',
                    fontWeight: c.isCurrent ? 700 : 400, color: c.isCurrent ? 'var(--primary-700)' : 'var(--text-muted)',
                  }}>{label(c.start)}</div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 'var(--text-sm)' }}>
            <strong style={{ color: 'var(--text-strong)' }}>{t('skyline.undated', { count: sky.undated.length })}</strong>
            {sky.undated.map(s => (
              <Link key={s.systemId} href={`/projects/${id}/systems/${s.systemId}?tab=plan&gate=${gateId}`} title={s.systemName}
                style={{ minHeight: 32, display: 'inline-flex', alignItems: 'center', padding: '0 8px', borderRadius: 6, border: '1px solid var(--border)', color: 'var(--text-strong)', textDecoration: 'none', fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-xs)' }}>
                {s.systemCode}
              </Link>
            ))}
            {sky.undated.length > 0 && <span style={{ color: 'var(--text-muted)' }}>{t('skyline.undatedHint')}</span>}
          </div>
        </>
      )}
    </div>
  )
}

const TONE: Record<SkylineTone, React.CSSProperties> = {
  approved: { background: 'var(--success-700)', color: '#ffffff', border: '1px solid var(--success-700)' },
  mid: { background: 'var(--warning-300)', color: 'var(--warning-900)', border: '1px solid var(--warning-300)' },
  low: { background: 'var(--danger-50)', color: 'var(--danger-800)', border: '1px solid var(--danger-200)' },
}

type T = Awaited<ReturnType<typeof getTranslations<'Planning'>>>

function boxStyle(tone: SkylineTone, forecast: boolean, overdue: boolean): React.CSSProperties {
  return {
    ...TONE[tone],
    ...(forecast ? { border: '2px dashed var(--text-strong)' } : {}),
    ...(overdue ? { border: '3px solid var(--danger-600)' } : {}),
  }
}

function Box({ b, href, t }: { b: SkylineBox; href: string; t: T }) {
  const pct = Math.round(b.pct * 100)
  const state = b.tone === 'approved' ? t('skyline.approved') : t('skyline.pct', { pct })
  const title = [
    `${b.systemCode} — ${b.systemName}`,
    `${t(b.basis === 'commitment' ? 'skyline.commitment' : 'skyline.forecast')}: ${b.date}`,
    b.tone === 'approved' ? t('skyline.approved') : t('skyline.itrs', { pct, total: b.itrTotal }),
    b.overdue ? t('skyline.overdue') : null,
  ].filter(Boolean).join(' · ')
  return (
    <Link href={href} title={title} aria-label={title} style={{
      ...boxStyle(b.tone, b.basis === 'forecast', b.overdue),
      display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 6px', minHeight: 44, boxSizing: 'border-box',
      borderRadius: 6, textDecoration: 'none', overflow: 'hidden',
    }}>
      <strong style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.systemCode}</strong>
      <span style={{ fontSize: 12 }}>{state}</span>
    </Link>
  )
}

function Legend({ t }: { t: T }) {
  const items: [string, React.CSSProperties][] = [
    [t('skyline.approved'), boxStyle('approved', false, false)],
    [t('skyline.legendMid'), boxStyle('mid', false, false)],
    [t('skyline.legendLow'), boxStyle('low', false, false)],
    [t('skyline.legendForecast'), { border: '2px dashed var(--text-strong)' }],
    [t('skyline.overdue'), { border: '3px solid var(--danger-600)' }],
  ]
  return (
    <ul aria-label={t('skyline.legend')} style={{ display: 'flex', flexWrap: 'wrap', gap: 16, listStyle: 'none', margin: 0, padding: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
      {items.map(([text, style]) => (
        <li key={text} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 3, boxSizing: 'border-box', ...style }} />{text}
        </li>
      ))}
    </ul>
  )
}
