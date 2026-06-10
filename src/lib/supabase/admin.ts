import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'

// Service role client — bypasses RLS entirely.
// ONLY use server-side in trusted server actions. Never expose to the client.
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
