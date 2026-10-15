'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import * as XLSX from 'xlsx'
import { Modal } from '@/components/ui'
import { importTestPacks, type TestPackImportResult } from '@/app/actions/registers'
import { sanitizeRow } from '@/lib/excel/sanitize'
import { parseTestPackWorkbook, type LineImportRow, type PackImportRow } from '@/lib/registers/test-packs-import'
import { btn, small } from '../register-ui'
import type { PackRow } from './TestPacksView'

type Parsed = { fileName: string; packs: PackImportRow[]; lines: LineImportRow[]; errors: string[] }

const TEST_TYPE_LABEL: Record<string, string> = { hydrostatic: 'Hidrostática', pneumatic: 'Neumática', service: 'Servicio' }

export default function ImportTestPacksModal({ projectId, packs, onClose }: {
  projectId: string
  packs: PackRow[]
  onClose: () => void
}) {
  const t = useTranslations('Registers.testPacks.importer')
  const router = useRouter()
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [fatal, setFatal] = useState<string | null>(null)
  const [result, setResult] = useState<TestPackImportResult | null>(null)
  const [isPending, startTransition] = useTransition()

  /** Plantilla con los packs y líneas actuales: se completa y se vuelve a subir. */
  function downloadTemplate() {
    const packRows = packs.map(p => sanitizeRow({
      'TEST PACK': p.packRef ?? p.number, 'TÍTULO': p.title, SISTEMA: p.system ?? '',
      'TIPO PRUEBA': p.testType ? TEST_TYPE_LABEL[p.testType] ?? '' : '', MEDIO: '',
      'PRESIÓN DISEÑO': '', 'PRESIÓN PRUEBA': '', 'RETENCIÓN': '', 'LÍMITES': '',
    }))
    const lineRows = packs.flatMap(p => p.lines.map(l => sanitizeRow({ 'LÍNEA': l.tag_number, 'TEST PACK': p.packRef ?? p.number })))
    const wb = XLSX.utils.book_new()
    const ws1 = XLSX.utils.json_to_sheet(packRows.length ? packRows : [{
      'TEST PACK': 'TP-001', 'TÍTULO': '', SISTEMA: '', 'TIPO PRUEBA': 'Hidrostática', MEDIO: 'Agua',
      'PRESIÓN DISEÑO': '', 'PRESIÓN PRUEBA': '', 'RETENCIÓN': '', 'LÍMITES': '',
    }])
    ws1['!cols'] = [14, 32, 12, 14, 10, 14, 14, 11, 36].map(wch => ({ wch }))
    const ws2 = XLSX.utils.json_to_sheet(lineRows.length ? lineRows : [{ 'LÍNEA': '', 'TEST PACK': 'TP-001' }])
    ws2['!cols'] = [28, 14].map(wch => ({ wch }))
    XLSX.utils.book_append_sheet(wb, ws1, 'Packs')
    XLSX.utils.book_append_sheet(wb, ws2, 'Líneas')
    XLSX.writeFile(wb, 'CommUp_TestPacks.xlsx')
  }

  function onFile(file: File) {
    setFatal(null); setResult(null); setParsed(null)
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target?.result as ArrayBuffer), { type: 'array' })
        const res = parseTestPackWorkbook(wb, { packs: t('sheetPacks'), lines: t('sheetLines') })
        if (!res.packs.length && !res.lines.length) { setFatal(t('nothingFound')); return }
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
      const res = await importTestPacks({ projectId, packs: parsed.packs, lines: parsed.lines })
      setResult(res)
      if (!res.error) router.refresh()
    })
  }

  return (
    <Modal open onClose={onClose} title={t('title')} size="lg"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 8 }}>
          <button type="button" style={btn('outline')} onClick={downloadTemplate}>{t('template')}</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={btn('outline')} onClick={onClose}>{result ? t('close') : t('cancel')}</button>
            {!result && <button type="button" style={btn('primary', !parsed || isPending)} disabled={!parsed || isPending} onClick={submit}>{isPending ? t('importing') : t('submit')}</button>}
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ ...small, margin: 0, lineHeight: 1.5 }}>{t('help')}</p>
        <input type="file" accept=".xlsx,.xls" aria-label={t('file')} onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
        {fatal && <div role="alert" style={{ color: 'var(--danger-700)', fontSize: 'var(--text-sm)' }}>{fatal}</div>}

        {parsed && !result && (
          <div style={small}>
            <strong style={{ color: 'var(--text-strong)' }}>{parsed.fileName}</strong>: {t('preview', { packs: parsed.packs.length, lines: parsed.lines.length })}
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
          <div role="status" style={small}>
            {result.error ? <div style={{ color: 'var(--danger-700)' }}>{result.error}</div> : (
              <div style={{ color: 'var(--text-strong)', fontWeight: 600 }}>
                {t('done', { created: result.created, updated: result.updated, lines: result.linesLinked })}
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
