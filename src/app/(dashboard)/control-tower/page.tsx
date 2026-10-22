import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Card, Table, THead, TBody, TR, TH, TD, TableWrapper } from '@/components/ui'
import type { RowState } from '@/lib/readiness/matrix'
import { loadPortfolioReadiness, ROW_STATES } from '@/lib/readiness/portfolio-server'

// N2a (decisión de Luis 2026-10-21): Readiness vive dentro del proyecto (/projects/[id]/readiness).
// /control-tower queda como vista de portafolio: una fila por proyecto con su readiness, que abre el proyecto.
// Enlaces viejos con ?projectId= siguen funcionando (redirigen con los mismos filtros).

const STATE_TONE: Record<RowState, string> = {
  regressed: 'var(--danger-700)', blocked: 'var(--danger-500)', signing: '#1d4ed8', ready: 'var(--success-700)', done: 'var(--success-500)',
}

export default async function ReadinessPortfolioPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const params = await searchParams
  if (params.projectId) {
    const rest = new URLSearchParams(Object.entries(params).filter(([k, v]) => k !== 'projectId' && !!v) as [string, string][])
    const qs = rest.toString()
    redirect(`/projects/${encodeURIComponent(params.projectId)}/readiness${qs ? `?${qs}` : ''}`)
  }

  const t = await getTranslations('ControlTower')
  const summaries = await loadPortfolioReadiness(ctx.supabase, ctx.orgId)

  return (
    <div style={{ padding: 'clamp(12px, 4vw, 32px)', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('portfolio.title')}</h1>
        <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)', margin: '4px 0 0' }}>{t('portfolio.subtitle')}</p>
      </div>
      {summaries.length === 0 ? (
        <Card padding="lg" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{t('portfolio.empty')}</Card>
      ) : (
        <TableWrapper>
          <div style={{ overflowX: 'auto' }}>
            <Table aria-label={t('portfolio.title')}>
              <THead>
                <TR>
                  <TH style={{ minWidth: 200 }}>{t('portfolio.col.project')}</TH>
                  <TH style={{ width: 90, textAlign: 'right' }}>{t('portfolio.col.systems')}</TH>
                  <TH style={{ width: 170 }}>{t('portfolio.col.readiness')}</TH>
                  <TH style={{ width: 120 }}>{t('portfolio.col.physical')}</TH>
                  <TH style={{ minWidth: 300 }}>{t('portfolio.col.next')}</TH>
                  <TH style={{ width: 130, textAlign: 'right' }}>{t('portfolio.col.constraintsN4')}</TH>
                  <TH style={{ width: 150, textAlign: 'right' }}>{t('portfolio.col.commitmentsSoon')}</TH>
                  <TH style={{ width: 150 }} />
                </TR>
              </THead>
              <TBody>
                {summaries.map(p => (
                  <TR key={p.id}>
                    <TD>
                      <Link href={`/projects/${p.id}/readiness`} style={{ fontWeight: 700, color: 'var(--text-strong)', textDecoration: 'none' }}>{p.code}</Link>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{p.name}</div>
                    </TD>
                    <TD style={{ textAlign: 'right', fontWeight: 600 }}>{p.systems}</TD>
                    <TD>
                      <div style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{p.readiness.done}/{p.readiness.total}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{(p.readiness.pct * 100).toFixed(1)} %</div>
                    </TD>
                    <TD style={{ fontWeight: 600 }}>{(p.weighted * 100).toFixed(1)} %</TD>
                    <TD>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 'var(--text-sm)' }}>
                        {ROW_STATES.filter(s => p.counts[s] > 0).map(s => (
                          <Link key={s} href={`/projects/${p.id}/readiness?state=${s}`} style={{ color: STATE_TONE[s], fontWeight: 600, textDecoration: 'none' }}>
                            {t(`rowState.${s}`)} {p.counts[s]}
                          </Link>
                        ))}
                        {p.systems === 0 && <span style={{ color: 'var(--text-muted)' }}>{t('empty')}</span>}
                      </div>
                    </TD>
                    <TD style={{ textAlign: 'right', fontWeight: 600, color: p.constraintsN4 > 0 ? 'var(--danger-700)' : 'var(--gray-400)' }}>{p.constraintsN4}</TD>
                    <TD style={{ textAlign: 'right' }}>
                      <Link href={`/projects/${p.id}/readiness?committed=7`} style={{ fontWeight: 600, textDecoration: 'none', color: p.commitmentsSoon > 0 ? '#b45309' : 'var(--gray-400)' }}>{p.commitmentsSoon}</Link>
                    </TD>
                    <TD style={{ textAlign: 'right' }}>
                      <Link href={`/projects/${p.id}/readiness`} style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--primary-600)', textDecoration: 'none' }}>{t('portfolio.open')}</Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </TableWrapper>
      )}
    </div>
  )
}
