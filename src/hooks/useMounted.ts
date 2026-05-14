'use client'

import { useEffect, useState } from 'react'

/**
 * Returns true after the component has mounted on the client.
 * Use to gate UI that depends on browser-only APIs (navigator, document, localStorage,
 * theme cookies) so SSR markup matches the first client render and hydration is stable.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical SSR mount guard; the setState here is the entire point of the hook
  useEffect(() => { setMounted(true) }, [])
  return mounted
}
