'use client'

// C-19: campos escritos del ITR con borrador (useDraftField): guardan al dejar de escribir, al salir del campo
// y al ocultarse la página, no al perder el foco solamente.

import { useRef } from 'react'
import MicAppend from './MicAppend'
import { useDraftField } from './useDraftField'

type TextareaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'defaultValue' | 'onChange' | 'onBlur'>

/** Textarea + dictado por voz debajo (el dictado guarda en el acto). */
export function DraftTextarea({ saved, onCommit, ...props }: TextareaProps & {
  saved: string
  onCommit: (value: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const field = useDraftField(saved, onCommit)
  return (
    <>
      <textarea {...props} ref={ref} value={field.value} onChange={e => field.change(e.target.value)} onBlur={field.flush} />
      <div style={{ alignSelf: 'flex-end' }}>
        <MicAppend
          targetRef={ref}
          disabled={props.disabled}
          onCommit={value => { field.change(value); field.flush() }}
        />
      </div>
    </>
  )
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange' | 'onBlur'>

export function DraftInput({ saved, onCommit, ...props }: InputProps & {
  saved: string
  onCommit: (value: string) => void
}) {
  const field = useDraftField(saved, onCommit)
  return <input {...props} value={field.value} onChange={e => field.change(e.target.value)} onBlur={field.flush} />
}
