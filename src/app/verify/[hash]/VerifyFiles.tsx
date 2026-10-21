'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { sha256Hex, fromBase64, verifyBytes } from '@/lib/handover/sign'

type FileRow = { path: string; sha256: string; bytes: number }
type Check = { name: string; result: 'match' | 'nomatch' | 'sig_ok' | 'sig_bad' | 'sig_unavailable'; path?: string }

const mono: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }

/**
 * Comprueba en el navegador (nada se sube) los archivos del ZIP: el sha256 de cada uno contra el manifiesto
 * registrado y, para manifest.json, la firma Ed25519 con la clave pública de CommUp.
 */
export default function VerifyFiles({ files, signature, publicKey }: { files: FileRow[]; signature: string | null; publicKey: string | null }) {
  const t = useTranslations('HandoverVerify')
  const [checks, setChecks] = useState<Check[]>([])
  const [busy, setBusy] = useState(false)

  async function onFiles(list: FileList | null) {
    if (!list?.length) return
    setBusy(true)
    const out: Check[] = []
    for (const f of Array.from(list)) {
      const bytes = new Uint8Array(await f.arrayBuffer())
      if (f.name === 'manifest.json') {
        if (!signature || !publicKey) out.push({ name: f.name, result: 'sig_unavailable' })
        else {
          const ok = await verifyBytes(fromBase64(publicKey), signature, bytes).catch(() => false)
          out.push({ name: f.name, result: ok ? 'sig_ok' : 'sig_bad' })
        }
        continue
      }
      const h = await sha256Hex(bytes)
      const hit = files.find(x => x.sha256 === h)
      out.push({ name: f.name, result: hit ? 'match' : 'nomatch', path: hit?.path })
    }
    setChecks(out)
    setBusy(false)
  }

  const color = (r: Check['result']) => (r === 'match' || r === 'sig_ok' ? 'var(--success-700, #15803d)' : r === 'sig_unavailable' ? 'var(--gray-500, #64748b)' : 'var(--danger-700, #b91c1c)')

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <label style={{ display: 'block', border: '2px dashed var(--gray-300, #cbd5e1)', borderRadius: 10, padding: 16, textAlign: 'center', cursor: 'pointer' }}>
        <input type="file" multiple style={{ display: 'none' }} onChange={e => onFiles(e.target.files)} />
        {busy ? t('checking') : t('drop')}
      </label>
      {checks.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
          {checks.map((c, i) => (
            <li key={i} style={{ color: color(c.result) }}>
              <strong>{c.name}</strong> — {t(`result.${c.result}`, { path: c.path ?? '' })}
            </li>
          ))}
        </ul>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--gray-500, #64748b)' }}>
              <th style={{ padding: '4px 8px' }}>{t('file')}</th>
              <th style={{ padding: '4px 8px' }}>sha256</th>
              <th style={{ padding: '4px 8px', textAlign: 'right' }}>{t('size')}</th>
            </tr>
          </thead>
          <tbody>
            {files.map(f => (
              <tr key={f.path} style={{ borderTop: '1px solid var(--gray-100, #f1f5f9)' }}>
                <td style={{ padding: '4px 8px', wordBreak: 'break-all' }}>{f.path}</td>
                <td style={{ padding: '4px 8px', ...mono }} title={f.sha256}>{f.sha256.slice(0, 16)}…</td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>{(f.bytes / 1024).toFixed(0)} KB</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
