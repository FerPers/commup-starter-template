'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw, Settings2 } from 'lucide-react'
import { Button, Modal, useToast } from '@/components/ui'
import type { DashboardLayout, WidgetConfig, WidgetId } from '@/types/dashboard'
import { resetDashboardLayout, saveDashboardLayout } from '@/app/actions/dashboard-layout'

interface WidgetOption {
  id: WidgetId
  title: string
  desc: string
}

interface DashboardCustomizerProps {
  layout: DashboardLayout
  options: WidgetOption[]
}

export default function DashboardCustomizer({ layout, options }: DashboardCustomizerProps) {
  const t = useTranslations('Dashboard.customizer')
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<WidgetConfig[]>(layout.widgets)
  const [pending, startTransition] = useTransition()

  const titleById = new Map(options.map(o => [o.id, o.title]))
  const descById = new Map(options.map(o => [o.id, o.desc]))

  function move(idx: number, dir: -1 | 1) {
    const target = idx + dir
    if (target < 0 || target >= draft.length) return
    const next = draft.slice()
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setDraft(next)
  }

  function toggleHidden(idx: number) {
    const next = draft.slice()
    next[idx] = { ...next[idx], hidden: !next[idx].hidden }
    setDraft(next)
  }

  function handleOpen() {
    setDraft(layout.widgets)
    setOpen(true)
  }

  function handleSave() {
    startTransition(async () => {
      const res = await saveDashboardLayout({ widgets: draft })
      if ('error' in res) {
        toast.error(res.error ?? t('saveError'))
        return
      }
      toast.success(t('saved'))
      setOpen(false)
    })
  }

  function handleReset() {
    startTransition(async () => {
      const res = await resetDashboardLayout()
      if ('error' in res) {
        toast.error(res.error ?? t('saveError'))
        return
      }
      toast.success(t('reset'))
      setOpen(false)
    })
  }

  return (
    <>
      <Button variant="outline" size="sm" leftIcon={<Settings2 size={14} aria-hidden="true" />} onClick={handleOpen}>
        {t('customize')}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('title')}
        description={t('description')}
        size="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 12 }}>
            <Button variant="ghost" size="sm" leftIcon={<RotateCcw size={14} aria-hidden="true" />} onClick={handleReset} disabled={pending}>
              {t('resetDefaults')}
            </Button>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
                {t('cancel')}
              </Button>
              <Button variant="primary" size="sm" onClick={handleSave} loading={pending}>
                {t('save')}
              </Button>
            </div>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {draft.length === 0 && (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 0, textAlign: 'center', padding: '16px 0' }}>
              {t('empty')}
            </p>
          )}
          {draft.map((w, idx) => {
            const title = titleById.get(w.id) ?? w.id
            const desc = descById.get(w.id) ?? ''
            return (
              <div
                key={w.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto',
                  gap: 12,
                  alignItems: 'center',
                  padding: '12px 14px',
                  background: w.hidden ? 'var(--gray-50)' : 'var(--card-bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  opacity: w.hidden ? 0.6 : 1,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <button
                    type="button"
                    aria-label={t('moveUp')}
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0 || pending}
                    style={iconBtn(idx === 0)}
                  >
                    <ArrowUp size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={t('moveDown')}
                    onClick={() => move(idx, 1)}
                    disabled={idx === draft.length - 1 || pending}
                    style={iconBtn(idx === draft.length - 1)}
                  >
                    <ArrowDown size={14} aria-hidden="true" />
                  </button>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-strong)' }}>{title}</div>
                  {desc && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>}
                </div>
                <button
                  type="button"
                  aria-label={w.hidden ? t('show') : t('hide')}
                  onClick={() => toggleHidden(idx)}
                  disabled={pending}
                  style={{
                    height: 32, width: 32,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    color: w.hidden ? 'var(--gray-500)' : 'var(--primary-500)',
                    cursor: pending ? 'not-allowed' : 'pointer',
                  }}
                >
                  {w.hidden ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                </button>
              </div>
            )
          })}
        </div>
      </Modal>
    </>
  )
}

function iconBtn(disabled: boolean) {
  return {
    height: 22, width: 22,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: disabled ? 'var(--gray-300)' : 'var(--text-muted)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    padding: 0,
  } as const
}
