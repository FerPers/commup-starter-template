'use client'

// Importar paquetes de vendor desde la lista de equipos tipo paquete (decisión de Luis, 2026-10-29; CPF Orotoy
// MEE-LI-101): el Excel se lee aquí (src/lib/vendors/package-list.ts), la vista previa deja editar título y
// alcance, y el servidor crea o actualiza cada paquete con su RPC (importVendorPackages). Nada se guarda antes.

import Link from 'next/link'
import { useId, useMemo, useState, useTransition } from 'react'
import * as XLSX from 'xlsx'
import { useTranslations } from 'next-intl'
import { importVendorPackages, type PackageImportResult } from '@/app/actions/vendors'
import { packageScope, parsePackageList } from '@/lib/vendors/package-list'
import { Alert, btn, card, input, label, small } from '../../daily/daily-ui'

type Draft = { include: boolean; items: string[]; title: string; scope: string; tags: string[] }
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', ...label, borderBottom: '1px solid var(--border)', background: 'var(--gray-50)' }
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-sm)', verticalAlign: 'top' }

export default function ImportPackagesWizard({ project, companies, canCreateTbd }: {
  project: { id: string; code: string; name: string }
  companies: { id: string; name: string; kind: string }[]
  canCreateTbd: boolean
}) {
  const t = useTranslations('Vendors.import')
  const ids = { file: useId(), sheet: useId(), company: useId() }
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [fileName, setFileName] = useState('')
  const [sheetName, setSheetName] = useState('')
  const [group, setGroup] = useState(true)
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  const [companyId, setCompanyId] = useState(() => companies.find(c => c.name === 'Proveedor por definir')?.id ?? (canCreateTbd ? 'tbd' : companies[0]?.id ?? ''))
  const [error, setError] = useState('')
  const [result, setResult] = useState<PackageImportResult | null>(null)
  const [saving, start] = useTransition()
  const hasTbd = companies.some(c => c.name === 'Proveedor por definir')

  const parsed = useMemo(() => {
    const ws = workbook?.Sheets[sheetName]
    return ws ? parsePackageList(XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false }), group) : []
  }, [workbook, sheetName, group])

  async function pick(f: File | null) {
    setError(''); setDrafts(null); setResult(null); setWorkbook(null)
    if (!f) return
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' })
      setWorkbook(wb); setFileName(f.name)
      setSheetName(wb.SheetNames.find(n => !/COVER|CARATULA|CARÁTULA|REVISION/i.test(n)) ?? wb.SheetNames[0] ?? '')
    } catch { setError(t('notExcel')) }
  }

  function preview() {
    if (!parsed.length) { setError(t('noPackages')); return }
    setError('')
    setDrafts(parsed.map(p => ({ include: true, items: p.items, title: p.title, scope: packageScope(p), tags: p.tags })))
  }

  function patch(i: number, change: Partial<Draft>) {
    setDrafts(d => d && d.map((x, j) => (j === i ? { ...x, ...change } : x)))
  }

  function run() {
    if (!drafts) return
    setError('')
    start(async () => {
      const res = await importVendorPackages({
        projectId: project.id, companyId,
        packages: drafts.filter(d => d.include).map(d => ({ title: d.title, scope: d.scope, tagNumbers: d.tags })),
      })
      if (res.error || !res.result) { setError(res.error ?? t('failed')); return }
      setResult(res.result)
    })
  }

  const chosen = drafts?.filter(d => d.include).length ?? 0

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Link href={`/projects/${project.id}/vendors`} style={{ ...small, textDecoration: 'none' }}>← {project.code} · {t('back')}</Link>
      <div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('title')}</h1>
        <p style={{ ...small, margin: '4px 0 0', maxWidth: 820 }}>{t('intro')}</p>
      </div>
      {error && <Alert kind="error">{error}</Alert>}

      {result ? (
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Alert kind={result.errors.length ? 'warn' : 'ok'}>{t('done', { created: result.created, updated: result.updated })}</Alert>
          {result.missingTags.length > 0 && <p style={{ ...small, margin: 0 }}>{t('missingTags', { n: result.missingTags.length, list: result.missingTags.slice(0, 12).join(', ') })}</p>}
          {result.errors.map(e => <p key={e.title} style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--danger-700)' }}>{e.title}: {e.reason}</p>)}
          <div><Link href={`/projects/${project.id}/vendors`} style={btn('primary')}>{t('toList')}</Link></div>
        </div>
      ) : !drafts ? (
        <div style={{ ...card, display: 'grid', gap: 12, maxWidth: 640 }}>
          <label htmlFor={ids.file} style={label}>{t('file')}</label>
          <input id={ids.file} type="file" accept=".xlsx,.xls" style={input} onChange={e => void pick(e.target.files?.[0] ?? null)} />
          {workbook && (
            <>
              <label htmlFor={ids.sheet} style={label}>{t('sheet')}</label>
              <select id={ids.sheet} style={input} value={sheetName} onChange={e => setSheetName(e.target.value)}>
                {workbook.SheetNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 'var(--text-sm)' }}>
                <input type="checkbox" checked={group} onChange={e => setGroup(e.target.checked)} />
                <span>{t('group')}<br /><span style={small}>{t('groupHint')}</span></span>
              </label>
              <p style={{ ...small, margin: 0 }}>{t('found', { n: parsed.length })}</p>
              <div><button type="button" style={btn('primary', !parsed.length)} disabled={!parsed.length} onClick={preview}>{t('preview')}</button></div>
            </>
          )}
        </div>
      ) : (
        <>
          <div style={{ ...card, display: 'grid', gap: 8, maxWidth: 640 }}>
            <label htmlFor={ids.company} style={label}>{t('company')}</label>
            <select id={ids.company} style={input} value={companyId} onChange={e => setCompanyId(e.target.value)}>
              {!hasTbd && canCreateTbd && <option value="tbd">{t('tbdNew')}</option>}
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <p style={{ ...small, margin: 0 }}>{t('companyHint')}</p>
            {!companyId && <Alert kind="warn">{t('noCompany')}</Alert>}
          </div>

          <p style={{ ...small, margin: 0 }}>{t('summary', { n: chosen, file: fileName })}</p>
          <div style={{ ...card, padding: 0, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}><span className="sr-only">{t('col.include')}</span></th>
                <th style={th}>{t('col.items')}</th><th style={th}>{t('col.title')}</th><th style={th}>{t('col.tags')}</th><th style={th}>{t('col.scope')}</th>
              </tr></thead>
              <tbody>{drafts.map((d, i) => (
                <tr key={d.items.join(',')} style={{ opacity: d.include ? 1 : 0.5 }}>
                  <td style={td}><input type="checkbox" aria-label={t('col.include')} checked={d.include} onChange={e => patch(i, { include: e.target.checked })} /></td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{d.items.length > 3 ? `${d.items[0]}–${d.items[d.items.length - 1]} (${d.items.length})` : d.items.join(', ')}</td>
                  <td style={{ ...td, minWidth: 220 }}><input aria-label={t('col.title')} style={input} maxLength={200} value={d.title} onChange={e => patch(i, { title: e.target.value })} /></td>
                  <td style={{ ...td, maxWidth: 240 }}>{d.tags.length ? <span style={{ fontFamily: 'monospace' }}>{d.tags.slice(0, 6).join(', ')}{d.tags.length > 6 ? ` … (${d.tags.length})` : ''}</span> : <span style={small}>{t('noTags')}</span>}</td>
                  <td style={{ ...td, minWidth: 320 }}>
                    <textarea aria-label={t('col.scope')} style={{ ...input, minHeight: 72, resize: 'vertical' }} maxLength={8000} value={d.scope} onChange={e => patch(i, { scope: e.target.value })} />
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={btn('primary', saving || !chosen || !companyId)} disabled={saving || !chosen || !companyId} onClick={run}>{saving ? t('importing') : t('import', { n: chosen })}</button>
            <button type="button" style={btn('outline')} onClick={() => setDrafts(null)}>{t('change')}</button>
          </div>
        </>
      )}
    </div>
  )
}
