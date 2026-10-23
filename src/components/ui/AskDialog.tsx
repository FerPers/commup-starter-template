'use client'

import { useCallback, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Modal } from './Modal'
import { Button } from './Button'

/**
 * Diálogo propio para confirmar o pedir un motivo (S25b, E-34): reemplaza `window.prompt` / `window.confirm`, que en
 * una PWA móvil se cierran por error, no admiten texto largo, no dejan elegir un criterio y en el navegador
 * integrado se cancelan solos.
 *
 *   const { dialog, ask } = useAskDialog()
 *   const reason = await ask({ title, confirmLabel, input: { label, minLength: 3 }, choices })   // null = cancelado
 *   const ok = (await ask({ title, message, confirmLabel, danger: true })) !== null
 *   if (!(await confirm({ message, confirmLabel, danger: true }))) return   // G-08 (en lugar de window.confirm)
 *   …
 *   return <>{dialog}…</>
 */
export type AskOptions = {
  title: string
  message?: ReactNode
  confirmLabel: string
  danger?: boolean
  /** Pide un texto (motivo, comentario). Sin `input`, el diálogo solo confirma y devuelve ''. */
  input?: { label: string; placeholder?: string; minLength?: number; multiline?: boolean; initial?: string }
  /** Opciones predefinidas (p. ej. los criterios de parada): elegir una llena el texto, que sigue editable. */
  choices?: string[]
  /** Segundo camino (p. ej. «Detener» ante un valor fuera de rango): devuelve `ASK_ALTERNATIVE`. */
  alternative?: string
}

/** Solo confirmar (G-08, reemplazo de `window.confirm`): el texto de siempre va en `message`; título y botón
 *  por defecto «Confirmar» (`AskDialog.confirm`, `delete`, `discard`, `remove`, `revoke`, `continue` sirven de botón). */
export type ConfirmOptions = Omit<AskOptions, 'title' | 'confirmLabel' | 'input' | 'choices' | 'alternative'> & {
  title?: string
  confirmLabel?: string
}

/** Lo que devuelve `ask` cuando se elige la acción alternativa. */
export const ASK_ALTERNATIVE = '\u0000alternative'

type Pending = AskOptions & { resolve: (v: string | null) => void }

export function useAskDialog(): {
  dialog: ReactNode
  ask: (o: AskOptions) => Promise<string | null>
  confirm: (o: ConfirmOptions) => Promise<boolean>
} {
  const t = useTranslations('AskDialog')
  const [pending, setPending] = useState<Pending | null>(null)
  const [text, setText] = useState('')
  const [choice, setChoice] = useState<number | null>(null)
  const resolved = useRef(false)
  const fieldId = useId()

  const ask = useCallback((o: AskOptions) => new Promise<string | null>(resolve => {
    resolved.current = false
    setText(o.input?.initial ?? '')
    setChoice(null)
    setPending({ ...o, resolve })
  }), [])

  const confirm = useCallback(async (o: ConfirmOptions) => {
    const label = o.confirmLabel ?? t('confirm')
    return (await ask({ ...o, title: o.title ?? label, confirmLabel: label })) !== null
  }, [ask, t])

  const finish = useCallback((v: string | null) => {
    if (!pending || resolved.current) return
    resolved.current = true
    pending.resolve(v)
    setPending(null)
  }, [pending])

  const min = pending?.input?.minLength ?? 0
  const valid = !pending?.input || text.trim().length >= min
  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', fontSize: 16, borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--surface, #fff)', color: 'var(--text-strong)', boxSizing: 'border-box',
  }

  // Si la acción es «Cancelar» (cancelar una acción, una TQ…), el botón que cierra dice «Volver» para no repetir.
  const dialog = pending ? (
    <Modal open onClose={() => finish(null)} title={pending.title} size="md" closeOnBackdrop={false}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button variant="outline" size="lg" onClick={() => finish(null)}>{pending.confirmLabel === t('cancel') ? t('back') : t('cancel')}</Button>
          {pending.alternative && <Button variant="danger" size="lg" onClick={() => finish(ASK_ALTERNATIVE)}>{pending.alternative}</Button>}
          <Button variant={pending.danger ? 'danger' : 'primary'} size="lg" disabled={!valid}
            onClick={() => finish(pending.input ? text.trim() : '')}>{pending.confirmLabel}</Button>
        </div>
      }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {pending.message && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)', whiteSpace: 'pre-wrap' }}>{pending.message}</div>}
        {!!pending.choices?.length && (
          <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <legend style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>{t('choices')}</legend>
            {pending.choices.map((c, i) => (
              <label key={i} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 'var(--text-sm)',
                border: `1px solid ${choice === i ? 'var(--primary-500, #6366f1)' : 'var(--border)'}`,
              }}>
                <input type="radio" name="ask-choice" checked={choice === i} style={{ marginTop: 3 }}
                  onChange={() => { setChoice(i); setText(c) }} />
                <span>{c}</span>
              </label>
            ))}
          </fieldset>
        )}
        {pending.input && (
          <label htmlFor={fieldId} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-muted)' }}>
            {pending.input.label}{min > 0 ? ` (${t('minChars', { n: min })})` : ''}
            {pending.input.multiline === false
              ? <input id={fieldId} autoFocus style={fieldStyle} value={text} placeholder={pending.input.placeholder} onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && valid) finish(text.trim()) }} />
              : <textarea id={fieldId} autoFocus rows={3} style={{ ...fieldStyle, resize: 'vertical' }} value={text} placeholder={pending.input.placeholder}
                  onChange={e => setText(e.target.value)} />}
          </label>
        )}
      </div>
    </Modal>
  ) : null

  return { dialog, ask, confirm }
}
