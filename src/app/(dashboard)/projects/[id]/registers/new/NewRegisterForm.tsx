'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createRegisterItem } from '@/app/actions/registers'
import type { RegisterKind } from '@/lib/registers/catalog'
import { RegisterFields, TagPicker, type TagValue } from '../RegisterFields'
import { btn, card, input, label, linkStyle, small } from '../register-ui'

type Props = {
  project: { id: string; code: string; name: string }
  kinds: RegisterKind[]
  initialKind: RegisterKind
  systems: { id: string; code: string; name: string }[]
  initialSystemId: string
  /** Registro al que quedará vinculado el nuevo (ej. una ciega creada desde su test pack). */
  linkTo: { id: string; number: string } | null
  /** N3b: tag de la ficha desde la que se abrió ＋ Crear. */
  initialTag?: { tag_id: string; tag_number: string } | null
}

export default function NewRegisterForm({ project, kinds, initialKind, systems, initialSystemId, linkTo, initialTag }: Props) {
  const t = useTranslations('Registers')
  const router = useRouter()
  const [kind, setKind] = useState(initialKind)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [systemId, setSystemId] = useState(initialSystemId)
  const [data, setData] = useState<Record<string, unknown>>({})
  const [tags, setTags] = useState<TagValue[]>(() => initialTag ? [{ ...initialTag, role: 'subject' }] : [])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function changeKind(k: RegisterKind) {
    setKind(k)
    setData({})
    setTags([])
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      const res = await createRegisterItem({
        projectId: project.id, kind, title, description, systemId: systemId || null, data,
        tags: tags.map(({ tag_id, role }) => ({ tag_id, role })), linkToId: linkTo?.id,
      })
      if (res.error || !res.id) { setError(res.error ?? 'Error'); return }
      router.push(`/projects/${project.id}/registers/${linkTo?.id ?? res.id}`)
    })
  }

  return (
    <div style={{ padding: 32, maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <Link href={`/projects/${project.id}/registers`} style={linkStyle}>← {t('detail.back')}</Link>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-strong)', margin: '8px 0 0' }}>{t('new')}</h1>
        <p style={{ ...small, margin: '4px 0 0' }}>{project.code} · {project.name}</p>
        {linkTo && <p style={{ ...small, margin: '4px 0 0', fontWeight: 600 }}>{t('form.linkTo', { number: linkTo.number })}</p>}
      </div>

      {error && <div role="alert" style={{ padding: '10px 14px', background: 'var(--danger-50)', border: '1px solid var(--danger-200)', borderRadius: 8, color: 'var(--danger-700)', fontSize: 'var(--text-sm)' }}>{error}</div>}

      <section style={card} aria-label={t('form.type')}>
        <div style={{ ...label, marginBottom: 8 }}>{t('form.type')}</div>
        <div role="radiogroup" aria-label={t('form.type')} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
          {kinds.map(k => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} aria-label={t(`kind.${k}`)} onClick={() => changeKind(k)}
              style={{ textAlign: 'left', padding: 12, borderRadius: 10, cursor: 'pointer',
                border: kind === k ? '2px solid var(--primary-500)' : '1px solid var(--border)', background: kind === k ? 'var(--primary-50)' : 'var(--card-bg)' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-strong)', fontSize: 'var(--text-sm)' }}>{t(`kind.${k}`)}</div>
              <div style={{ ...small, fontSize: 'var(--text-xs)', marginTop: 2 }}>{t(`kindHelp.${k}`)}</div>
            </button>
          ))}
        </div>
      </section>

      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={label}>{t('form.title')}</span>
          <input style={input} value={title} maxLength={200} placeholder={t('form.titlePlaceholder')} onChange={e => setTitle(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={label}>{t('form.description')}</span>
          <textarea rows={2} style={input} value={description} maxLength={2000} onChange={e => setDescription(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 420 }}>
          <span style={label}>{t('form.system')}</span>
          <select style={input} value={systemId} onChange={e => setSystemId(e.target.value)}>
            <option value="">{t('form.noSystem')}</option>
            {systems.map(s => <option key={s.id} value={s.id}>{s.code}{s.name !== s.code ? ` — ${s.name}` : ''}</option>)}
          </select>
          <span style={{ ...small, fontSize: 'var(--text-xs)' }}>{t('form.systemHelp')}</span>
        </label>
        <div>
          <div style={{ ...label, marginBottom: 6 }}>{t('form.tags')}</div>
          <TagPicker projectId={project.id} kind={kind} value={tags} onChange={setTags} />
        </div>
      </section>

      <section style={card} aria-label={t('form.fields')}>
        <div style={{ ...label, marginBottom: 10 }}>{t('form.fields')}</div>
        <RegisterFields kind={kind} value={data} onChange={setData} />
      </section>

      <div>
        <button type="button" style={btn('primary', isPending || !title.trim())} disabled={isPending || !title.trim()} onClick={submit}>{t('form.create')}</button>
      </div>
    </div>
  )
}
