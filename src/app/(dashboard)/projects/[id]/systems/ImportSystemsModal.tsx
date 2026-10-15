'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import * as XLSX from 'xlsx'
import { Modal } from '@/components/ui'
import { importSystemsWorkbook, type SystemsImportResult } from '@/app/actions/systems'
import { sanitizeRow } from '@/lib/excel/sanitize'
import { parseSystemsWorkbook, type DependencyImportRow, type SystemImportRow } from '@/lib/systems/import'
import type { DependencyEdge, SystemListItem } from './SystemsView'

type Parsed = { fileName: string; systems: SystemImportRow[]; dependencies: DependencyImportRow[]; errors: string[] }

const TYPE_LABEL = { process: 'Proceso', utility: 'Utility', safety: 'Seguridad' } as const
const KIND_LABEL = { utility: 'Utility', process: 'Proceso', other: 'Otro' } as const

const small: React.CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }
const btn = (primary: boolean): React.CSSProperties => ({
  padding: '7px 14px', borderRadius: 8, fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer',
  border: primary ? 'none' : '1px solid var(--border)', background: primary ? 'var(--primary-500)' : 'transparent',
  color: primary ? '#fff' : 'var(--text-strong)',
})

export default function ImportSystemsModal({ projectId, systems, edges, onClose }: {
  projectId: string
  systems: SystemListItem[]
  edges: DependencyEdge[]
  onClose: () => void
}) {
  const t = useTranslations('Systems.import')
  const router = useRouter()
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [fatal, setFatal] = useState<string | null>(null)
  const [result, setResult] = useState<SystemsImportResult | null>(null)
  const [isPending, startTransition] = useTransition()

  /** Plantilla con los sistemas y dependencias actuales del proyecto: se completa y se vuelve a subir. */
  function downloadTemplate() {
    const codeOf = new Map(systems.map(s => [s.id, s.code]))
    const sys = systems.map(s => sanitizeRow({
      SISTEMA: s.code, NOMBRE: s.name, TIPO: s.system_type ? TYPE_LABEL[s.system_type] : '',
      PRIORIDAD: s.priority ? `P${s.priority}` : '',
      ENTRADA: '', SALIDA: '', 'ELÉCTRICO': '', 'INSTRUMENTACIÓN': '', UTILITIES: '', NOTAS: '',
    }))
    const deps = edges.length
      ? edges.map(e => sanitizeRow({
          SISTEMA: codeOf.get(e.system_id) ?? '', 'DEPENDE DE': codeOf.get(e.depends_on_system_id) ?? '',
          'TIPO DEPENDENCIA': KIND_LABEL[e.kind], 'GATE REQUERIDO': e.required, 'GATE BLOQUEADO': e.blocked, NOTAS: '',
        }))
      : [{ SISTEMA: '', 'DEPENDE DE': '', 'TIPO DEPENDENCIA': '', 'GATE REQUERIDO': '', 'GATE BLOQUEADO': '', NOTAS: '' }]
    const wb = XLSX.utils.book_new()
    const ws1 = XLSX.utils.json_to_sheet(sys.length ? sys : [{ SISTEMA: '', NOMBRE: '', TIPO: '', PRIORIDAD: '' }])
    ws1['!cols'] = [14, 32, 12, 10, 24, 24, 24, 24, 24, 30].map(wch => ({ wch }))
    const ws2 = XLSX.utils.json_to_sheet(deps)
    ws2['!cols'] = [14, 14, 18, 16, 16, 30].map(wch => ({ wch }))
    XLSX.utils.book_append_sheet(wb, ws1, 'Sistemas')
    XLSX.utils.book_append_sheet(wb, ws2, 'Dependencias')
    XLSX.writeFile(wb, 'CommUp_Sistematizacion.xlsx')
  }

  function onFile(file: File) {
    setFatal(null); setResult(null); setParsed(null)
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target?.result as ArrayBuffer), { type: 'array' })
        const res = parseSystemsWorkbook(wb, { systems: t('sheetSystems'), dependencies: t('sheetDependencies') })
        if (!res.systems.length && !res.dependencies.length) { setFatal(t('nothingFound')); return }
        setParsed({ fileName: file.name, ...res })
      } catch {
        setFatal(t('readError'))
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function submit() {
    if (!parsed) return
    startTransition(async () => {
      const res = await importSystemsWorkbook({ projectId, systems: parsed.systems, dependencies: parsed.dependencies })
      setResult(res)
      if (!res.error) router.refresh()
    })
  }

  return (
    <Modal open onClose={onClose} title={t('title')} size="lg"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 8 }}>
          <button type="button" style={btn(false)} onClick={downloadTemplate}>{t('template')}</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={btn(false)} onClick={onClose}>{result ? t('close') : t('cancel')}</button>
            {!result && <button type="button" style={btn(true)} disabled={!parsed || isPending} onClick={submit}>{isPending ? t('importing') : t('submit')}</button>}
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ ...small, margin: 0, lineHeight: 1.5 }}>{t('help')}</p>
        <input type="file" accept=".xlsx,.xls" aria-label={t('file')} onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
        {fatal && <div role="alert" style={{ color: 'var(--danger-700)', fontSize: 'var(--text-sm)' }}>{fatal}</div>}

        {parsed && !result && (
          <div style={{ ...small }}>
            <strong style={{ color: 'var(--text-strong)' }}>{parsed.fileName}</strong>: {t('preview', { systems: parsed.systems.length, dependencies: parsed.dependencies.length })}
            {parsed.errors.length > 0 && (
              <>
                <div style={{ marginTop: 8, color: '#b45309', fontWeight: 600 }}>{t('skipped', { count: parsed.errors.length })}</div>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18, maxHeight: 160, overflowY: 'auto' }}>
                  {parsed.errors.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </>
            )}
          </div>
        )}

        {result && (
          <div role="status" style={{ ...small }}>
            {result.error ? <div style={{ color: 'var(--danger-700)' }}>{result.error}</div> : (
              <div style={{ color: 'var(--text-strong)', fontWeight: 600 }}>
                {t('done', { systems: result.systemsUpdated, created: result.dependenciesCreated, existing: result.dependenciesExisting })}
              </div>
            )}
            {result.errors.length > 0 && (
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, maxHeight: 200, overflowY: 'auto', color: 'var(--danger-700)' }}>
                {result.errors.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
