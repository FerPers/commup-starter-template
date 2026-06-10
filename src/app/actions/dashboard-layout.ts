'use server'

// User-scoped UI preference (no org/project context) — same pattern as
// locale.ts / theme.ts. The layout is stored on profiles.dashboard_layout
// keyed by the authenticated user, so raw auth.getUser() is intentional here.
// EXCLUIDO del wrapper withAuth a propósito (S8): no requiere membership de org,
// igual que theme/locale. RLS de profiles gobierna el update.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { DashboardLayout } from '@/types/dashboard'
import { WIDGET_REGISTRY } from '@/lib/dashboard/registry'

const ALLOWED_IDS = new Set(Object.keys(WIDGET_REGISTRY))

function sanitize(layout: DashboardLayout): DashboardLayout {
  if (!layout || !Array.isArray(layout.widgets)) return { widgets: [] }
  const seen = new Set<string>()
  const widgets = layout.widgets
    .filter(w => w && typeof w.id === 'string' && ALLOWED_IDS.has(w.id) && !seen.has(w.id))
    .map(w => {
      seen.add(w.id)
      return { id: w.id, hidden: !!w.hidden }
    })
  return { widgets }
}

export async function saveDashboardLayout(layout: DashboardLayout) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  const clean = sanitize(layout)
  const { error } = await supabase
    .from('profiles')
    .update({ dashboard_layout: clean })
    .eq('id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  return { ok: true as const }
}

export async function resetDashboardLayout() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  const { error } = await supabase
    .from('profiles')
    .update({ dashboard_layout: null })
    .eq('id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  return { ok: true as const }
}
