'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import { MoreHorizontal } from 'lucide-react'

const PANEL_WIDTH = 260

/**
 * Menú «⋯» de una fila de Usuarios: acceso hasta, suspender o reactivar, enlace para restablecer la contraseña y
 * quitar. El panel va con `position: fixed` calculado desde el botón para que la tabla (con `overflow`) no lo
 * recorte; se abre hacia arriba si no cabe abajo y se cierra con Esc, clic afuera, desplazamiento o al elegir.
 */
export function MemberActionsMenu({
  name,
  disabled,
  accessExpiresAt,
  showAccess,
  suspended,
  canSendReset,
  onExpiresChange,
  onToggleSuspend,
  onSendReset,
  onRemove,
}: {
  name: string
  disabled: boolean
  accessExpiresAt: string | null
  /** Acceso hasta y suspender: no para una invitación pendiente. */
  showAccess: boolean
  suspended: boolean
  /** Enlace de contraseña: solo miembros activos. */
  canSendReset: boolean
  onExpiresChange: (date: string | null) => void
  onToggleSuspend: () => void
  onSendReset: () => void
  onRemove: () => void
}) {
  const t = useTranslations('Users')
  const uid = useId()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const expires = accessExpiresAt?.slice(0, 10) ?? ''

  useLayoutEffect(() => {
    if (!open) return
    const b = buttonRef.current?.getBoundingClientRect()
    const panel = panelRef.current
    if (!b || !panel) return
    // Se ubica antes de pintar (sin estado): abajo del botón o arriba si no cabe.
    const h = panel.offsetHeight
    const below = b.bottom + 6
    panel.style.top = `${below + h > window.innerHeight - 8 ? Math.max(8, b.top - 6 - h) : below}px`
    panel.style.left = `${Math.min(Math.max(8, b.right - PANEL_WIDTH), window.innerWidth - PANEL_WIDTH - 8)}px`
    panel.style.visibility = 'visible'
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      close()
      buttonRef.current?.focus()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  function pick(fn: () => void) {
    setOpen(false)
    fn()
  }

  const itemStyle: CSSProperties = {
    display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
    background: 'transparent', border: 'none', borderRadius: 6,
    fontSize: 13, color: 'var(--text-strong)', cursor: 'pointer',
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={t('menu.label', { name })}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? `${uid}-panel` : undefined}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        style={{
          width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: open ? 'var(--gray-100)' : 'transparent', border: '1px solid var(--border)',
          borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer',
        }}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={panelRef}
          id={`${uid}-panel`}
          style={{
            position: 'fixed', top: 0, left: 0, width: PANEL_WIDTH,
            visibility: 'hidden', zIndex: 50, textAlign: 'left',
            background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10,
            boxShadow: '0 10px 30px rgba(0,0,0,0.12)', padding: 6,
          }}
        >
          {showAccess && (
            <div style={{ padding: '6px 10px 10px', borderBottom: '1px solid var(--gray-100)', marginBottom: 4 }}>
              <label htmlFor={`${uid}-expires`} style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                {t('access.expiresLabel')}
              </label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  id={`${uid}-expires`}
                  type="date"
                  defaultValue={expires}
                  disabled={disabled}
                  onChange={e => onExpiresChange(e.target.value || null)}
                  style={{ flex: 1, minWidth: 0, padding: '5px 6px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--card-bg)', color: 'var(--text-strong)' }}
                />
                {expires && (
                  <button type="button" disabled={disabled} onClick={() => pick(() => onExpiresChange(null))}
                    style={{ padding: '5px 8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    {t('menu.noExpiry')}
                  </button>
                )}
              </div>
            </div>
          )}
          {showAccess && (
            <button type="button" disabled={disabled} onClick={() => pick(onToggleSuspend)} style={itemStyle}>
              {suspended ? t('access.reactivate') : t('access.suspend')}
            </button>
          )}
          {canSendReset && (
            <button type="button" disabled={disabled} onClick={() => pick(onSendReset)} style={itemStyle}>
              {t('menu.sendReset')}
            </button>
          )}
          <button type="button" disabled={disabled} onClick={() => pick(onRemove)} style={{ ...itemStyle, color: 'var(--danger-700)' }}>
            {t('table.remove')}
          </button>
        </div>
      )}
    </>
  )
}
