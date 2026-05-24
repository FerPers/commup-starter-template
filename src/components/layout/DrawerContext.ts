'use client'

import { createContext, useContext } from 'react'

interface DrawerControls {
  open: () => void
}

export const DrawerContext = createContext<DrawerControls | null>(null)

export function useDrawerControls(): DrawerControls {
  return useContext(DrawerContext) ?? { open: () => {} }
}