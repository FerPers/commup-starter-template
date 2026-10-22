'use server'

import { cookies } from 'next/headers'
import { parseTheme, THEME_COOKIE } from '@/lib/theme'
import type { Theme } from '@/types/theme'

export async function setTheme(theme: Theme) {
  const cookieStore = await cookies()
  cookieStore.set(THEME_COOKIE, parseTheme(theme), { path: '/', maxAge: 60 * 60 * 24 * 365 })
}
