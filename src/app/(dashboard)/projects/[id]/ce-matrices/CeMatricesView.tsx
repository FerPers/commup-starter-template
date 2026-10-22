'use client'

import { useTranslations } from 'next-intl'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { saveCeMatrix } from '@/app/actions/ce-matrix'

export type MatrixRow = {
  id: string
  code: string
  title: string
  revision: string | null
  sourceDocument: string | null
  source: string
  system: string | null
  causes: number
  effects: number
  links: number
  gaps: number
}

const SOURCE_LABELS: Record<string, string> = { manual: 'Manual', import: 'Importada', ai: 'IA (revisada)' }

export default function CeMatricesView({ project, matrices, systems, canEdit }: {
  project: { id: string; code: string; name: string }
  matrices: MatrixRow[]
  systems: { id: string; code: string; name: string }[]
  canEdit: boolean
}) {
  // N0 (H-13): título = etiqueta del menú.
  const tNav = useTranslations('Sidebar.nav')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ code: '', title: '', systemId: '', revision: '', sourceDocument: '' })
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  const field = { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card-bg)', color: 'var(--text-strong)', fontSize: '13px', boxSizing: 'border-box' } as const
  const th = { padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' } as const

  function create(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    start(async () => {
      const res = await saveCeMatrix({ projectId: project.id, ...form, systemId: form.systemId || null })
      if (res.error || !res.id) { setError(res.error ?? 'No se pudo crear'); return }
      router.push(`/projects/${project.id}/ce-matrices/${res.id}`)
    })
  }

  return (
    <div style={{ maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 4px' }}>{tNav('ceMatrices')}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0, maxWidth: '720px' }}>
            Lógica de paro y enclavamientos (SIS/ESD/PSD): cada causa con los efectos que dispara. Cada causa se prueba con su propio ITR, y el cruce probado queda como evidencia.
          </p>
        </div>
        {canEdit && <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Link href={`/projects/${project.id}/ce-matrices/import`} style={{ padding: '9px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-strong)', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>✨ Importar con IA</Link>
          <button type="button" onClick={() => setOpen(v => !v)} style={{ padding: '9px 14px', borderRadius: '8px', border: 0, background: 'var(--primary-600, #2563eb)', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>{open ? 'Cancelar' : '+ Nueva matriz'}</button>
        </div>}
      </div>

      {open && (
        <form onSubmit={create} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', marginBottom: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', alignItems: 'end' }}>
          <label style={{ fontSize: '12px' }}>Código *<input required maxLength={60} style={field} value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="CE-A100-S02" /></label>
          <label style={{ fontSize: '12px', gridColumn: 'span 2' }}>Título *<input required maxLength={200} style={field} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Paro de emergencia — separador de producción" /></label>
          <label style={{ fontSize: '12px' }}>Sistema
            <select style={field} value={form.systemId} onChange={e => setForm({ ...form, systemId: e.target.value })}>
              <option value="">—</option>
              {systems.map(s => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
            </select>
          </label>
          <label style={{ fontSize: '12px' }}>Revisión<input maxLength={30} style={field} value={form.revision} onChange={e => setForm({ ...form, revision: e.target.value })} placeholder="B" /></label>
          <label style={{ fontSize: '12px' }}>Documento fuente<input maxLength={200} style={field} value={form.sourceDocument} onChange={e => setForm({ ...form, sourceDocument: e.target.value })} placeholder="N° de plano / documento" /></label>
          <button type="submit" disabled={pending} style={{ padding: '9px 14px', borderRadius: '8px', border: 0, background: 'var(--primary-600, #2563eb)', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>{pending ? 'Creando…' : 'Crear y abrir'}</button>
          {error && <p role="alert" style={{ gridColumn: '1 / -1', color: '#b91c1c', fontSize: '12px', margin: 0 }}>{error}</p>}
        </form>
      )}

      {matrices.length === 0 ? (
        <div style={{ background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)', padding: '56px 32px', textAlign: 'center' }}>
          <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-strong)', margin: '0 0 6px' }}>Sin matrices causa-efecto</p>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Crea una matriz por sistema o por documento C&E y carga sus causas, efectos y cruces.</p>
        </div>
      ) : (
        <div style={{ background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead><tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
              {['Código', 'Título', 'Sistema', 'Rev.', 'Causas', 'Efectos', 'Cruces', 'Revisar', 'Origen'].map(h => <th key={h} style={th}>{h}</th>)}
            </tr></thead>
            <tbody>{matrices.map(m => (
              <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' }}><Link href={`/projects/${project.id}/ce-matrices/${m.id}`} style={{ color: 'var(--text-strong)' }}>{m.code}</Link></td>
                <td style={{ padding: '10px 12px', color: 'var(--text-strong)' }}>{m.title}{m.sourceDocument && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{m.sourceDocument}</div>}</td>
                <td style={{ padding: '10px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{m.system ?? '—'}</td>
                <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{m.revision ?? '—'}</td>
                <td style={{ padding: '10px 12px', fontVariantNumeric: 'tabular-nums' }}>{m.causes}</td>
                <td style={{ padding: '10px 12px', fontVariantNumeric: 'tabular-nums' }}>{m.effects}</td>
                <td style={{ padding: '10px 12px', fontVariantNumeric: 'tabular-nums' }}>{m.links}</td>
                <td style={{ padding: '10px 12px', color: m.gaps ? '#b45309' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>{m.gaps ? `⚠ ${m.gaps} sin cruce` : '—'}</td>
                <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{SOURCE_LABELS[m.source] ?? m.source}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
