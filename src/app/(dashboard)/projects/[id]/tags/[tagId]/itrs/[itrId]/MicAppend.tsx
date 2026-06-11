'use client'

import { useState, useEffect, useRef } from 'react'

// ── Voice append helper (Stage 14.3) ──────────────────────────────────
// Web Speech API directo. Sin tipos oficiales en lib.dom.d.ts para
// SpeechRecognition (solo *Result), tipamos como unknown.
type WebSpeechRecognizer = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  onresult: ((event: { results: SpeechRecognitionResultList }) => void) | null
  start: () => void
  stop: () => void
}

export default function MicAppend({
  targetRef,
  onCommit,
  language = 'es-ES',
  disabled,
}: {
  targetRef: React.RefObject<HTMLTextAreaElement | null>
  onCommit: (text: string) => void
  language?: string
  disabled?: boolean
}) {
  const recognitionRef = useRef<WebSpeechRecognizer | null>(null)
  const [supported, setSupported] = useState(false)
  const [active, setActive] = useState(false)

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => WebSpeechRecognizer
      webkitSpeechRecognition?: new () => WebSpeechRecognizer
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Web Speech API detection requires window access, only available client-side
    setSupported(Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition))
  }, [])

  if (!supported || disabled) return null

  const start = () => {
    const w = window as unknown as {
      SpeechRecognition?: new () => WebSpeechRecognizer
      webkitSpeechRecognition?: new () => WebSpeechRecognizer
    }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) return
    const rec = new Ctor()
    rec.lang = language
    rec.continuous = false
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onstart = () => setActive(true)
    rec.onend = () => { setActive(false); recognitionRef.current = null }
    rec.onerror = () => { setActive(false); recognitionRef.current = null }
    rec.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript?.trim()
      if (!text || !targetRef.current) return
      const cur = targetRef.current.value
      const sep = cur && !cur.endsWith(' ') ? ' ' : ''
      const next = cur + sep + text
      targetRef.current.value = next
      onCommit(next)
    }
    recognitionRef.current = rec
    rec.start()
  }

  const stop = () => recognitionRef.current?.stop()

  return (
    <button
      type="button"
      onClick={active ? stop : start}
      title={active ? 'Detener dictado' : 'Dictar'}
      style={{
        padding: '4px 8px', borderRadius: '6px', fontSize: '11px',
        border: '1px solid', borderColor: active ? '#ef4444' : 'var(--gray-300)',
        background: active ? '#fee2e2' : 'var(--card-bg)',
        color: active ? '#ef4444' : 'var(--text-muted)',
        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px',
      }}
    >
      <span>{active ? '■' : '🎤'}</span>
      <span>{active ? 'Detener' : 'Dictar'}</span>
    </button>
  )
}
