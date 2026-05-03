'use server'

import { getActiveMembership as getCtx } from '@/lib/supabase/membership'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { generateHandoverPackage } from '@/lib/handover/generate'

const ADMIN_ROLES = ['owner', 'admin', 'architect']

export type GenerateHandoverInput = {
  projectId: string
  systemIds: string[] | null
  formats:   ('json' | 'pdf')[]
}

export type GenerateHandoverResult = {
  error?:         string
  packageId?:     string
  signatureHash?: string
  jsonUrl?:       string | null
  pdfUrl?:        string | null
}

export async function generateHandoverPackageAction(
  input: GenerateHandoverInput,
): Promise<GenerateHandoverResult> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Not authenticated' }
  if (!ADMIN_ROLES.includes(ctx.role)) return { error: 'Insufficient permissions' }

  if (!input.projectId)                      return { error: 'projectId is required' }
  if (!input.formats || input.formats.length === 0) return { error: 'Select at least one format' }

  const { data: project } = await ctx.supabase
    .from('projects').select('id').eq('id', input.projectId).eq('org_id', ctx.orgId).maybeSingle()
  if (!project) return { error: 'Project not found' }

  const admin = createAdminClient()
  try {
    const result = await generateHandoverPackage(admin, {
      orgId:     ctx.orgId,
      projectId: input.projectId,
      systemIds: input.systemIds && input.systemIds.length > 0 ? input.systemIds : null,
      formats:   input.formats,
      actorId:   ctx.userId,
      source:    'ui',
      keyId:     null,
    })

    revalidatePath('/admin/handover')
    return {
      packageId:     result.packageId,
      signatureHash: result.signatureHash,
      jsonUrl:       result.jsonUrl,
      pdfUrl:        result.pdfUrl,
    }
  } catch (err) {
    let message: string
    if (err instanceof Error) message = err.message
    else if (typeof err === 'string') message = err
    else if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
      message = (err as { message: string }).message
    } else {
      try { message = JSON.stringify(err) } catch { message = String(err) }
    }
    return { error: message }
  }
}

export async function getSignedHandoverUrlsAction(
  packageId: string,
): Promise<{ error?: string; jsonUrl?: string | null; pdfUrl?: string | null }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Not authenticated' }

  const admin = createAdminClient()
  const { data: pkg } = await admin
    .from('handover_packages')
    .select('json_path, pdf_path, org_id')
    .eq('id', packageId)
    .maybeSingle()

  if (!pkg || pkg.org_id !== ctx.orgId) return { error: 'Package not found' }

  const [j, p] = await Promise.all([
    pkg.json_path ? admin.storage.from('handover-packages').createSignedUrl(pkg.json_path, 3600) : null,
    pkg.pdf_path  ? admin.storage.from('handover-packages').createSignedUrl(pkg.pdf_path,  3600) : null,
  ])

  return {
    jsonUrl: j?.data?.signedUrl ?? null,
    pdfUrl:  p?.data?.signedUrl ?? null,
  }
}
