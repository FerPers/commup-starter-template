import Link from 'next/link'
import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { normalizeTag } from '@/lib/ce/import'

export const metadata = { title: 'Tag 360° — CommUp' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_MATCHES = 20

type Match = { id: string; tag_number: string; description: string | null; project_id: string; projects: { code: string; name: string } }

// Resolver universal: acepta el id (etiquetas QR de CommUp), el número de tag en cualquier formato o el UID NFC, y
// redirige al detalle del tag dentro de su proyecto. Permite que /scan no necesite saber project_id.
// S13 (F-18/C-31): el número se compara por la clave normalizada `tags.tag_key` (sin mayúsculas, espacios ni
// guiones) y, si existe en varios proyectos de la org, se ofrece elegir (primero el último proyecto visitado, `?p=`)
// en lugar de saltar a uno cualquiera.
export default async function Tag360Resolver({
  params, searchParams,
}: {
  params: Promise<{ tagId: string }>
  searchParams: Promise<{ p?: string }>
}) {
  const [{ tagId }, { p: lastProjectId }] = await Promise.all([params, searchParams])

  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  let decoded = tagId
  try { decoded = decodeURIComponent(tagId) } catch { /* se usa tal cual */ }
  decoded = decoded.trim()

  // Tags están scoped por project_id, no por org_id directamente — joineamos.
  const base = () => supabase
    // bounded: cada uso agrega .limit(1) o .limit(MAX_MATCHES)
    .from('tags')
    .select('id, tag_number, description, project_id, projects!inner(code, name, org_id)')
    .eq('projects.org_id', ctx.orgId)

  let matches: Match[] = []
  if (UUID.test(decoded)) {
    const { data } = await base().eq('id', decoded).limit(1)
    matches = (data ?? []) as unknown as Match[]
  } else {
    const key = normalizeTag(decoded)
    if (key) {
      const { data } = await base().eq('tag_key', key).order('tag_number').limit(MAX_MATCHES)
      matches = (data ?? []) as unknown as Match[]
    }
    // NFC UID: los lectores emiten UIDs hex que no calzan con el número de tag.
    if (!matches.length) {
      const { data } = await base().eq('nfc_uid', decoded).limit(MAX_MATCHES)
      matches = (data ?? []) as unknown as Match[]
    }
  }

  if (!matches.length) notFound()
  if (matches.length === 1) redirect(`/projects/${matches[0].project_id}/tags/${matches[0].id}`)

  const t = await getTranslations('Tag360')
  const sorted = [...matches].sort((a, b) =>
    Number(b.project_id === lastProjectId) - Number(a.project_id === lastProjectId)
    || a.projects.code.localeCompare(b.projects.code) || a.tag_number.localeCompare(b.tag_number))

  return (
    <div style={{ padding: 24, maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('chooseTitle', { tag: decoded })}</h1>
      <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{t('chooseHelp', { n: matches.length })}</p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.map(m => (
          <li key={m.id}>
            <Link href={`/projects/${m.project_id}/tags/${m.id}`} style={{
              display: 'flex', flexDirection: 'column', gap: 2, padding: '12px 14px', borderRadius: 10, textDecoration: 'none',
              border: `1px solid ${m.project_id === lastProjectId ? 'var(--primary-500)' : 'var(--border)'}`, background: 'var(--card-bg)',
            }}>
              <span style={{ fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace' }}>{m.tag_number}</span>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>
                {m.projects.code} · {m.projects.name}{m.project_id === lastProjectId ? ` — ${t('lastProject')}` : ''}
              </span>
              {m.description && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{m.description}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
