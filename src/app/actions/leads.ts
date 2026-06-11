'use server'

/**
 * Server action PÚBLICA del form de leads del landing.
 *
 * Deliberadamente SIN withAuth: el visitante es anónimo. La tabla `leads`
 * tiene RLS sin policies, así que solo este action (service role) puede
 * escribirla. Defensas anti-spam:
 *   - honeypot (`website` debe venir vacío)
 *   - time-trap (envíos a <3s del render se descartan)
 *   - rate limit por IP hasheada (3/hora) y por email (3/día)
 * Los envíos descartados devuelven éxito para no dar señal a bots.
 */

import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWebPush } from '@/lib/push/web-push'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PROJECT_TYPES = ['oil_gas', 'lng', 'renewables', 'mining', 'industrial', 'other']

type LeadInput = {
  name: string
  company: string
  email: string
  projectType?: string
  message?: string
  website?: string // honeypot — los humanos nunca lo ven
  elapsedMs?: number // ms desde que el form se montó
  locale?: string
  source?: string
}

type LeadResult = { error: 'invalid' | 'rate_limited' | 'server' | null }

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function submitLead(input: LeadInput): Promise<LeadResult> {
  try {
    // Bots: fingir éxito sin guardar nada
    if (input.website) return { error: null }
    if (typeof input.elapsedMs === 'number' && input.elapsedMs >= 0 && input.elapsedMs < 3000) {
      return { error: null }
    }

    const name = (input.name ?? '').trim()
    const company = (input.company ?? '').trim()
    const email = (input.email ?? '').trim().toLowerCase()
    if (name.length < 2 || name.length > 120) return { error: 'invalid' }
    if (company.length < 2 || company.length > 120) return { error: 'invalid' }
    if (email.length > 254 || !EMAIL_RE.test(email)) return { error: 'invalid' }

    const projectType = PROJECT_TYPES.includes(input.projectType ?? '') ? input.projectType : null
    const message = (input.message ?? '').trim().slice(0, 2000) || null
    const locale = input.locale === 'en' ? 'en' : 'es'
    const source = (input.source ?? '').slice(0, 40) || null

    const h = await headers()
    const ip = h.get('cf-connecting-ip')
      ?? h.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? 'unknown'
    const ipHash = await sha256Hex(`${ip}:${process.env.CRON_SECRET ?? 'commup-leads'}`)
    const userAgent = (h.get('user-agent') ?? '').slice(0, 300) || null

    const admin = createAdminClient()

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count: ipCount } = await admin
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gte('created_at', hourAgo)
    if ((ipCount ?? 0) >= 3) return { error: 'rate_limited' }

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: emailCount } = await admin
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('email', email)
      .gte('created_at', dayAgo)
    if ((emailCount ?? 0) >= 3) return { error: 'rate_limited' }

    const { error } = await admin.from('leads').insert({
      name,
      company,
      email,
      project_type: projectType,
      message,
      locale,
      source,
      ip_hash: ipHash,
      user_agent: userAgent,
    })
    if (error) {
      console.error('[leads] insert failed:', error.message)
      return { error: 'server' }
    }

    // Best-effort: el lead ya está guardado, un fallo de push no debe romper el flujo
    await notifyOwner({ name, company, email, projectType: projectType ?? undefined })

    return { error: null }
  } catch (err) {
    console.error('[leads] unexpected:', err)
    return { error: 'server' }
  }
}

async function notifyOwner(lead: { name: string; company: string; email: string; projectType?: string }) {
  try {
    const userId = process.env.LEAD_NOTIFY_USER_ID
    if (!userId) return

    const admin = createAdminClient()
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth_secret')
      .eq('user_id', userId)
      .eq('enabled', true)
    if (!subs?.length) return

    const payload = JSON.stringify({
      title: 'Nuevo lead en commup.app',
      body: `${lead.company} — ${lead.name} <${lead.email}>${lead.projectType ? ` (${lead.projectType})` : ''}`,
      type: 'LEAD_CREATED',
      action_url: '/dashboard',
      priority: 'high',
      tag: `lead:${lead.email}`,
    })

    await Promise.all(subs.map(sub =>
      sendWebPush({
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth_secret,
        payload,
        urgency: 'high',
      })
    ))
  } catch (err) {
    console.error('[leads] push notify failed:', err)
  }
}
