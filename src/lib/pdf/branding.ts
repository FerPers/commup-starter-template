/**
 * E2 (plan referente, maquetas M): marca de los PDF formales. Cabecera con el logo de la organización a la
 * izquierda y el del cliente del proyecto a la derecha («CommUp» queda discreto en el pie), y QR al registro en
 * la app (certificado, ITR), sin hash ni verificación pública.
 *
 * Los logos viven en el bucket público org-assets. Solo se descargan URL de ese bucket de NUESTRO Supabase
 * (`logo_url` lo escribe un admin y podría apuntar a cualquier lado: nada de fetch libre desde el Worker).
 * pdf-lib embebe PNG y JPG; un WebP (o cualquier otra cosa) cae al nombre en texto.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import { LOGO_BUCKET, LOGO_MAX_BYTES } from '@/lib/constants/logos'
import { A4_W, COLOR, MARGIN, drawQr, type Renderer } from './renderer'

type Db = SupabaseClient<Database>

export type PdfLogo = { bytes: Uint8Array; kind: 'png' | 'jpg' }

export type PdfBranding = {
  orgName: string
  orgLogo: PdfLogo | null
  clientName: string | null
  clientLogo: PdfLogo | null
}

/** URL del bucket público de logos de este Supabase (sin el `?v=` de caché); null si no lo es. */
export function allowedLogoUrl(url: string | null | undefined, base = process.env.NEXT_PUBLIC_SUPABASE_URL): string | null {
  if (!url || !base) return null
  const prefix = `${base.replace(/\/$/, '')}/storage/v1/object/public/${LOGO_BUCKET}/`
  const clean = url.split('?')[0]
  if (!clean.startsWith(prefix) || clean.includes('..')) return null
  return clean
}

/** Tipo por los primeros bytes (no por la extensión ni el content-type). */
export function logoKind(bytes: Uint8Array): PdfLogo['kind'] | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png'
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  return null
}

async function fetchLogo(url: string | null | undefined): Promise<PdfLogo | null> {
  const clean = allowedLogoUrl(url)
  if (!clean) return null
  try {
    const res = await fetch(clean, { redirect: 'error' })
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length === 0 || bytes.length > LOGO_MAX_BYTES) return null
    const kind = logoKind(bytes)
    return kind ? { bytes, kind } : null
  } catch {
    return null
  }
}

/** Nombres y logos de la org y del cliente del proyecto. Un logo que no carga deja el nombre en texto. */
export async function loadPdfBranding(db: Db, projectId: string): Promise<PdfBranding> {
  const { data } = await db.from('projects')
    .select('client, client_logo_url, organizations(name, logo_url)')
    .eq('id', projectId).maybeSingle()
  const org = data?.organizations as unknown as { name: string; logo_url: string | null } | null
  const [orgLogo, clientLogo] = await Promise.all([fetchLogo(org?.logo_url), fetchLogo(data?.client_logo_url)])
  return { orgName: org?.name ?? '', orgLogo, clientName: data?.client ?? null, clientLogo }
}

const BAR_H = 36
const LOGO_W = 150

async function embed(r: Renderer, logo: PdfLogo | null) {
  if (!logo) return null
  try {
    return logo.kind === 'png' ? await r.doc.embedPng(logo.bytes) : await r.doc.embedJpg(logo.bytes)
  } catch {
    return null
  }
}

/**
 * Franja de marca arriba de la página: org a la izquierda, cliente a la derecha (logo o nombre). Sin datos de
 * marca dibuja «CommUp» como antes. Baja el cursor lo que ocupa.
 */
export async function drawBrandBar(r: Renderer, b: PdfBranding | null | undefined): Promise<void> {
  const top = r.y
  const [orgImg, clientImg] = await Promise.all([embed(r, b?.orgLogo ?? null), embed(r, b?.clientLogo ?? null)])

  if (orgImg) {
    const s = orgImg.scaleToFit(LOGO_W, BAR_H)
    r.page.drawImage(orgImg, { x: MARGIN, y: top - BAR_H + (BAR_H - s.height) / 2, width: s.width, height: s.height })
  } else {
    r.drawText(b?.orgName.trim() ? b.orgName : 'CommUp', { x: MARGIN, y: top - BAR_H / 2 - 5, size: 14, bold: true, color: COLOR.purple, maxWidth: 230 })
  }

  if (clientImg) {
    const s = clientImg.scaleToFit(LOGO_W, BAR_H)
    r.page.drawImage(clientImg, { x: A4_W - MARGIN - s.width, y: top - BAR_H + (BAR_H - s.height) / 2, width: s.width, height: s.height })
  } else if (b?.clientName) {
    r.drawTextRight(b.clientName, { rightX: A4_W - MARGIN, y: top - BAR_H / 2 - 4, size: 11, bold: true, color: COLOR.textLight, maxWidth: 230 })
  }
  r.moveY(BAR_H + 8)
}

/** QR al registro en la app con su leyenda debajo (bilingüe, como los PDF formales). `yTop` = borde superior. */
export function drawRecordQr(r: Renderer, url: string, x: number, yTop: number, size: number, lines: readonly string[] = ['Ver en CommUp', 'View in CommUp']) {
  drawQr(r.page, url, x, yTop - size, size)
  lines.forEach((line, i) => {
    const w = r.fontRegular.widthOfTextAtSize(line, 6)
    r.page.drawText(line, { x: x + (size - w) / 2, y: yTop - size - 6 - i * 7, size: 6, font: r.fontRegular, color: COLOR.muted })
  })
}
