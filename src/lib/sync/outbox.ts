'use client'

/**
 * Sprint O (2026-09-07) — helpers de cliente «enviar o encolar».
 *
 * Fotos y punches intentan el servidor primero; si no hay red (o el fetch
 * falla), quedan en la bandeja de salida de IndexedDB y se reenvían desde
 * src/lib/sync/replay.ts al reconectar. Cada helper devuelve `queued: true`
 * cuando se encoló para que la UI muestre el estado pendiente.
 */

import { createClient } from '@/lib/supabase/client'
import { saveItrAttachment, signItr } from '@/app/actions/itr-instances'
import { addPunchAttachment, createPunch } from '@/app/actions/punches'
import { enqueueOutbox, removeFromOutbox, type OutboxEntry, type OutboxPhoto, type OutboxSignature } from '@/lib/offline-queue'

export { LOCAL_ATTACHMENT_PREFIX, localAttachmentId, parseLocalAttachmentId, isNetworkFailure, storagePathFor } from './outbox-utils'
import { localAttachmentId, parseLocalAttachmentId, isNetworkFailure, punchPhotoPath, storagePathFor } from './outbox-utils'

export type PhotoAttachmentResult = {
  id: string
  item_id: string | null
  file_url: string
  file_type: string
  captured_at: string
  signed_url: string | null
  pending?: boolean
}

/**
 * Sube una foto al bucket y registra el adjunto; sin red la encola.
 * Lanza solo si el servidor rechaza (error lógico); los fallos de red se encolan.
 */
export async function uploadPhoto(
  photo: Omit<OutboxPhoto, 'kind'>,
): Promise<{ attachment: PhotoAttachmentResult; queued: false } | { error: string }> {
  const supabase = createClient()
  const path = storagePathFor(photo.itrId, photo.itemId, photo.fileName)
  const { error: upErr } = await supabase.storage.from('itr-attachments').upload(path, photo.blob, { contentType: photo.fileType })
  if (upErr) {
    if (isNetworkFailure(upErr)) throw upErr
    return { error: upErr.message }
  }
  const res = await saveItrAttachment({
    itrId: photo.itrId, itemId: photo.itemId, storagePath: path, fileType: photo.fileType,
    projectId: photo.projectId, tagId: photo.tagId,
  })
  if (res.error) return { error: res.error }
  const { data: signed } = await supabase.storage.from('itr-attachments').createSignedUrl(path, 3600)
  return {
    queued: false,
    attachment: {
      id: res.id!, item_id: photo.itemId, file_url: path, file_type: photo.fileType,
      captured_at: new Date().toISOString(), signed_url: signed?.signedUrl ?? null,
    },
  }
}

export async function uploadOrQueuePhoto(
  photo: Omit<OutboxPhoto, 'kind'>,
): Promise<{ attachment: PhotoAttachmentResult; queued: boolean } | { error: string }> {
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      return await uploadPhoto(photo)
    } catch (err) {
      if (!isNetworkFailure(err)) return { error: err instanceof Error ? err.message : String(err) }
    }
  }
  const id = await enqueueOutbox({ kind: 'photo', ...photo })
  // Sin vista previa: la miniatura real la pinta quien escucha OUTBOX_CHANGED_EVENT.
  return { queued: true, attachment: pendingAttachment({ id, kind: 'photo', ...photo, queuedAt: new Date().toISOString(), attempts: 0 }, false) }
}

/** Adjunto «virtual» para pintar una foto que aún está en la bandeja de salida. */
export function pendingAttachment(entry: OutboxEntry & OutboxPhoto, withPreview = true): PhotoAttachmentResult {
  return {
    id: localAttachmentId(entry.id ?? 0),
    item_id: entry.itemId,
    file_url: '',
    file_type: entry.fileType,
    captured_at: entry.queuedAt,
    signed_url: withPreview && typeof URL !== 'undefined' ? URL.createObjectURL(entry.blob) : null,
    pending: true,
  }
}

export async function discardPendingPhoto(attachmentId: string): Promise<boolean> {
  const outboxId = parseLocalAttachmentId(attachmentId)
  if (outboxId === null) return false
  await removeFromOutbox(outboxId)
  return true
}

export type PunchPhoto = { fileName: string; fileType: string; blob: Blob }

export type PunchInput = {
  /** S06 (C-22): id generado en el cliente (crypto.randomUUID): reenviar no duplica el punch ni sus fotos. */
  punchId: string
  itrId: string
  itrItemId: string | null
  projectId: string
  tagId: string
  category: 'A' | 'B' | 'C'
  description: string
  targetDate: string | null
  assignedTo: string | null
  impact: 'safety' | 'process' | 'equipment' | 'operability' | 'environment'
  photos: PunchPhoto[]
}

/**
 * Crea el punch y sube sus fotos a `punch-attachments/<punchId>/…`. Idempotente: el punch se busca por
 * id antes de crearlo, cada foto tiene ruta fija y el adjunto no se duplica. Lanza ante un fallo de red
 * (para encolar); devuelve `error` ante un rechazo del servidor.
 */
export async function sendPunch(input: PunchInput): Promise<{ ok: true; punchNumber?: string } | { error: string }> {
  const res = await createPunch({
    id: input.punchId, projectId: input.projectId, tagId: input.tagId, itrId: input.itrId, itrItemId: input.itrItemId,
    category: input.category, description: input.description, targetDate: input.targetDate,
    assignedTo: input.assignedTo, impact: input.impact,
  })
  if (res.error) return { error: res.error }
  const supabase = createClient()
  for (const [index, photo] of input.photos.entries()) {
    const path = punchPhotoPath(input.punchId, index, photo.fileName)
    const { error: upErr } = await supabase.storage.from('punch-attachments').upload(path, photo.blob, { contentType: photo.fileType, upsert: false })
    if (upErr && !/already exists|duplicate/i.test(upErr.message)) {
      if (isNetworkFailure(upErr)) throw upErr
      return { error: `Foto ${index + 1}: ${upErr.message}` }
    }
    const att = await addPunchAttachment({ punchId: input.punchId, storagePath: path, projectId: input.projectId, tagId: input.tagId })
    if (att.error) return { error: `Foto ${index + 1}: ${att.error}` }
  }
  return { ok: true, punchNumber: res.punchNumber }
}

/** Registra el punch con sus fotos; sin red lo encola entero. `queued: true` cuando quedó pendiente. */
export async function createPunchOrQueue(
  input: PunchInput,
): Promise<{ queued: boolean; punchNumber?: string } | { error: string }> {
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const res = await sendPunch(input)
      if ('error' in res) return { error: res.error }
      return { queued: false, punchNumber: res.punchNumber }
    } catch (err) {
      if (!isNetworkFailure(err)) return { error: err instanceof Error ? err.message : String(err) }
    }
  }
  await enqueueOutbox({ kind: 'punch', ...input })
  return { queued: true }
}

export type SignatureInput = Omit<OutboxSignature, 'kind'>

/**
 * Firma el ITR; sin red la encola. La UI debe haber comprobado que el ITR está
 * completo localmente (localItrStatus) — al sincronizar, las respuestas se
 * envían antes que la bandeja, así que el servidor ya lo verá «completed».
 */
export async function signOrQueue(
  input: SignatureInput,
): Promise<{ queued: boolean } | { error: string }> {
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const res = await signItr(input.itrId, input.role, input.projectId, input.tagId, input.signatureImage)
      if (res.error) return { error: res.error }
      return { queued: false }
    } catch (err) {
      if (!isNetworkFailure(err)) return { error: err instanceof Error ? err.message : String(err) }
    }
  }
  await enqueueOutbox({ kind: 'signature', ...input })
  return { queued: true }
}

/** Firma «virtual» para pintar una firma que aún está en la bandeja de salida. */
export function pendingSignature(entry: OutboxEntry & OutboxSignature, userId: string, userName: string | null) {
  return {
    id: `local:${entry.id ?? 0}`,
    role: entry.role,
    signed_at: entry.queuedAt,
    user_id: userId,
    signature_image: entry.signatureImage,
    profiles: userName ? { full_name: userName } : null,
    pending: true as const,
  }
}
